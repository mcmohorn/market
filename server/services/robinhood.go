package services

import (
	"errors"
	"fmt"
	"math"
	"os"
	"sync"
	"time"

	"astuart.co/go-robinhood"
	"github.com/mcmohorn/market/server/data"
	"github.com/mcmohorn/market/server/helper"
	"go.mongodb.org/mongo-driver/mongo"
)

func InitializeRobinhoodClient() (*robinhood.Client, error) {
	cli, err := robinhood.Dial(&robinhood.OAuth{
		Username: os.Getenv("RH_USERNAME"),
		Password: os.Getenv("RH_PASSWORD"),
	})

	return cli, err
}

func GetMyAccounts(cli *robinhood.Client) ([]robinhood.Account, error) {
	as, err := cli.GetAccounts()
	if err != nil {
		return nil, err
	}
	fmt.Println("accounts:")
	for _, p := range as {
		fmt.Printf(" %v", p.AccountNumber)
	}
	return as, err

}

func GetMyAccount(cli *robinhood.Client, wg *sync.WaitGroup) (acct robinhood.Account, e error) {
	defer wg.Done()
	as, e := cli.GetAccounts()
	if e != nil {
		return
	}
	if len(as) == 0 {
		e = errors.New("No RH accounts found")
		return
	}

	return as[0], nil

}

func GetCryptoPositions(cli *robinhood.Client, wg *sync.WaitGroup) ([]data.MyPosition, error) {
	defer wg.Done()

	mypositions := make([]data.MyPosition, 0)

	pairs, err := cli.GetCryptoCurrencyPairs()
	if err != nil {
		return nil, err
	}
	for _, p := range pairs {
		mypositions = append(mypositions, data.MyPosition{
			Symbol:        p.Symbol,
			Quantity:      float32(p.CyrptoAssetCurrency.Increment),
			AssetCurrency: p.CyrptoAssetCurrency,
			CurrencyPair:  p,
		})
	}

	// fmt.Println(portfolio)
	return mypositions, err

}

func GetPositions(cli *robinhood.Client, wg *sync.WaitGroup, acc robinhood.Account) ([]data.MyPosition, error) {
	defer wg.Done()

	mypositions := make([]data.MyPosition, 0)

	acc.User = "https://" + acc.User

	as, err := cli.GetAccounts()
	if err != nil {
		return nil, err
	}

	as[0].User = "https://" + as[0].User
	as[0].Positions = "https://api.robinhood.com/positions/"

	ps, err := cli.GetPositions(as[0])

	if err != nil {
		return nil, err
	}
	for _, p := range ps {
		if p.Quantity > 0 {
			i, _ := cli.GetInstrument(p.Instrument)
			qs, _ := cli.GetQuote(i.Symbol)
			mypositions = append(mypositions, data.MyPosition{
				Symbol:       i.Symbol,
				Quantity:     float32(p.Quantity),
				CurrentPrice: float32(qs[0].LastTradePrice),
				Instrument:   i,
			})
		}

		// fmt.Printf("%5v | %5v * %v\n", i.Symbol, p.Quantity, qs[0].LastTradePrice, )
	}
	return mypositions, err

}

// TradeQuantityAtPrice calls robinhood trade api to submit an order to buy / sell
func TradeQuantityAtPrice(cli *robinhood.Client, wg *sync.WaitGroup, DB *mongo.Database, symbol string, quant float32, price float64, side robinhood.OrderSide) (*robinhood.OrderOutput, error) {

	defer wg.Done()

	i, _ := cli.GetInstrumentForSymbol(symbol)

	fmt.Printf("Attempting to %v %v shares of %v at %.2f\n", side, uint64(quant), symbol, price)

	orderOptions := robinhood.OrderOpts{
		Price:    math.Round(price*100) / 100,
		Side:     side,
		Quantity: uint64(quant),
	}

	newevent := data.OrderEvent{
		Symbol:   symbol,
		Quantity: quant,
	}

	orderOutput, err := cli.Order(i, orderOptions)

	newevent.Completed = time.Now().Unix()
	newevent.ErrorMessage = orderOutput.RejectReason

	if err != nil {
		fmt.Printf("Error with order: %v", err)
	}

	// db.CreateEvent(ctx, DB, newevent)

	// this log is misleading, really just submitted an order but ok for now
	fmt.Printf("%v %v shares of %v at %.2f\n", helper.PrettyBoughtMessageFromSide(side), orderOutput.Quantity, i.Symbol, orderOutput.Price)
	return orderOutput, err
}
