package services

import (
	"context"
	"errors"
	"fmt"
	"math"
	"os"
	"sync"
	"time"

	"github.com/andrewstuart/go-robinhood"
	"github.com/mcmohorn/market/server/data"
	"github.com/mcmohorn/market/server/db"
	"github.com/mcmohorn/market/server/helper"
	"go.mongodb.org/mongo-driver/mongo"
)

func InitializeRobinhoodClient(ctx context.Context) (*robinhood.Client, error) {
	cli, err := robinhood.Dial(ctx, &robinhood.OAuth{
		Username: os.Getenv("RH_USERNAME"),
		Password: os.Getenv("RH_PASSWORD"),
	})

	return cli, err
}

func GetMyAccounts(ctx context.Context, cli *robinhood.Client) ([]robinhood.Account, error) {
	as, err := cli.GetAccounts(ctx)
	if err != nil {
		return nil, err
	}
	fmt.Println("accounts:")
	for _, p := range as {
		fmt.Printf(" %v", p.AccountNumber)
	}
	return as, err

}

func GetMyAccount(ctx context.Context, cli *robinhood.Client, wg *sync.WaitGroup) (acct robinhood.Account, e error) {
	defer wg.Done()
	as, e := cli.GetAccounts(ctx)
	if e != nil {
		return
	}
	if len(as) == 0 {
		e = errors.New("No RH accounts found")
		return
	}
	fmt.Printf("my account: %v\n", as[0].AccountNumber)

	return as[0], nil

}

func GetPositions(ctx context.Context, cli *robinhood.Client, wg *sync.WaitGroup) ([]data.MyPosition, error) {
	defer wg.Done()

	mypositions := make([]data.MyPosition, 0)

	ps, err := cli.GetPositions(ctx)

	if err != nil {
		return nil, err
	}
	for _, p := range ps {
		i, _ := cli.GetInstrument(ctx, p.Instrument)
		qs, _ := cli.GetQuote(ctx, i.Symbol)
		mypositions = append(mypositions, data.MyPosition{
			Symbol:       i.Symbol,
			Quantity:     float32(p.Quantity),
			CurrentPrice: float32(qs[0].LastTradePrice),
			Instrument:   i,
		})
		// fmt.Printf("%5v | %5v * %v\n", i.Symbol, p.Quantity, qs[0].LastTradePrice, )
	}
	return mypositions, err

}

// TradeQuantityAtPrice calls robinhood trade api to submit an order to buy / sell
func TradeQuantityAtPrice(ctx context.Context, cli *robinhood.Client, wg *sync.WaitGroup, DB *mongo.Database, symbol string, quant float32, price float64, side robinhood.OrderSide) (*robinhood.OrderOutput, error) {

	defer wg.Done()

	i, _ := cli.GetInstrumentForSymbol(ctx, symbol)

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

	orderOutput, err := cli.Order(ctx, i, orderOptions)

	newevent.Completed = time.Now().Unix()
	newevent.ErrorMessage = orderOutput.RejectReason

	if err != nil {
		fmt.Printf("Error with order: %v", err)
	}

	db.CreateEvent(ctx, DB, newevent)

	// this log is misleading, really just submitted an order but ok for now
	fmt.Printf("%v %v shares of %v at $.2%f\n", helper.PrettyBoughtMessageFromSide(side), orderOutput.Quantity, i.Symbol, orderOutput.Price)
	return orderOutput, err
}
