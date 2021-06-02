package app

import (
	"fmt"
	"log"
	"math"
	"os"
	"reflect"
	"sort"
	"sync"
	"time"

	"astuart.co/go-robinhood"

	gq "github.com/markcheno/go-quote"

	"github.com/rivo/tview"

	"github.com/alpacahq/alpaca-trade-api-go/alpaca"
	"github.com/alpacahq/alpaca-trade-api-go/common"
	"github.com/fabioberger/coinbase-go"
	"github.com/gorilla/mux"
	"github.com/mcmohorn/market/server/config"
	"github.com/mcmohorn/market/server/data"
	"github.com/mcmohorn/market/server/db"
	"github.com/mcmohorn/market/server/helper"
	"github.com/mcmohorn/market/server/indicators"
	"github.com/mcmohorn/market/server/reader"
	"github.com/mcmohorn/market/server/services"

	"go.mongodb.org/mongo-driver/mongo"
)

// App is our backend web application
type App struct {
	Router             *mux.Router
	DB                 *mongo.Database
	alpacaClient       *alpaca.Client
	viewApp            *tview.Application
	baseGrid           *tview.Grid
	viewTable          *tview.Table
	accountTable       *tview.Table
	positionsTable     *tview.Table
	cryptoTable        *tview.Table
	statusText         *tview.TextView
	robinhoodClient    *robinhood.Client
	coinbaseClient     coinbase.Client
	minDataPointsToBuy int
	Timeframe          string
	forbiddenSymbols   []string
	currentData        []data.SymbolData
	currentCryptoData  []data.SymbolData
	currentPositions   []data.MyPosition
	account            robinhood.Account

	header string
	footer string
	status string

	sortSymbolAscending       bool
	sortChangedAscending      bool
	sortDiffAscending         bool
	sortDiffAdjustedAscending bool
	sortNAscending            bool
	sortNChangesAscending     bool
}

func getField(v *data.MyBar, field string) float32 {
	r := reflect.ValueOf(v)
	f := reflect.Indirect(r).FieldByName(field)
	return float32(f.Float())
}

func (a *App) StartDayTrader() {
	options := data.DayTraderOptions{
		Interval:      60,
		MinCashLimit:  5,
		MaxSharePrice: 2000,
		MinBuySignal:  0.001,
		PerformTrades: true,
	}
	a.header = "Minutely"
	a.Timeframe = "minute"
	a.OperateDayTrader(&options)
}

func (a *App) StartCryptoAnalysis() {
	a.SetAppStatus("Starting Crypto Analysis")
	go a.DrawTable()

	var wg sync.WaitGroup
	cryptoOpts := data.AnalysisOptions{
		IsCrypto:          true,
		Concurrency:       4,
		Filename:          "cryptos.txt",
		SymbolsPerRequest: 100,
		StartTime:         time.Now().AddDate(-1, 0, 0),
		EndTime:           time.Now(),
	}

	wg.Add(1)
	a.SetAppStatus("getting crypto positions")
	var err error
	a.currentPositions, err = services.GetCryptoPositions(a.robinhoodClient, &wg)
	wg.Wait()
	if err != nil {
		fmt.Println("sholdnt get hurr")
	}

	wg.Add(1)
	cryptodata, _ := a.GrabDataAndAnalyze(&wg, &cryptoOpts)
	wg.Wait()
	a.currentData = cryptodata
	go a.DrawTable()
}

func (a *App) StartEndOfDayAnalysis() {

	go a.DrawTable()

	var wg sync.WaitGroup
	a.SetAppStatus("Getting Account")
	wg.Add(1)
	account, _ := services.GetMyAccount(a.robinhoodClient, &wg)
	a.account = account
	wg.Wait() // wait for account to be retrieved

	a.SetAppStatus("Getting Positions")

	wg.Add(1)
	ps, e := services.GetPositions(a.robinhoodClient, &wg, account)
	wg.Wait()
	if e != nil {
		// fmt.Println(e)
		// log.Panic(e)
	}
	a.currentPositions = ps
	a.UpdatePositionsTableData()
	go a.DrawTable()

	a.UpdateAccountTableData()

	a.SetAppStatus("Grabbing Data")
	go a.DrawTable()
	options := data.AnalysisOptions{
		Filename:          "tickers2.txt",
		Concurrency:       4,
		Timeframe:         "1D",
		SymbolsPerRequest: 100,
		StartTime:         time.Now().AddDate(-1, 0, 0), // one year ago
		EndTime:           time.Now(),                   // until today
	}
	wg.Add(1)
	stockData, _ := a.GrabDataAndAnalyze(&wg, &options)
	wg.Wait()
	a.currentData = stockData

	a.UpdateCurrentPositionsFromCurrentData()
	a.SetAppStatus("Stock Analysis Complete")
	a.DrawTable()

}

func (a *App) UpdateCurrentPositionsFromCurrentData() {
	// update our current positions with its latest Symbol Data
	for _, d := range a.currentData {
		for i, p := range a.currentPositions {
			if p.Symbol == d.Symbol {
				a.currentPositions[i].Data = d
			}
		}
	}
}

func (a *App) SetAppStatus(status string) {
	a.status = status
	a.statusText.SetText(status)
}

// AnalyzeTickersInFile reads a file where each line is a stock ticker and analyzes the bars to return better mybars
func (a *App) GrabDataAndAnalyze(wg *sync.WaitGroup, opts *data.AnalysisOptions) ([]data.SymbolData, error) {
	defer wg.Done()

	var symbols []string
	go a.SetAppStatus("Reading symbols from file: " + opts.Filename)
	filename := opts.Filename
	symbols = reader.ReadTickersFromFile(filename)

	concurrency := opts.Concurrency
	symbolsPerRequest := opts.SymbolsPerRequest
	jobs := make(chan []string)
	results := make(chan map[string][]data.MyBar)
	errors := make(chan error)

	numJobs := int(math.Ceil(float64(len(symbols)) / float64(symbolsPerRequest)))

	if opts.PrintSymbolMath {
		fmt.Printf("%v symbols needs %v jobs\n", len(symbols), numJobs)
	}
	// routine that populate our todo channel
	go func() {
		// create the concurrent workers
		for x := 0; x < concurrency; x++ {
			go a.worker(x, jobs, results, errors, opts)
		}

		for x := 0; x < numJobs; x++ {
			correctIndex := math.Min(float64(x*symbolsPerRequest+symbolsPerRequest), float64(len(symbols)))
			jobs <- symbols[x*symbolsPerRequest : int(correctIndex)]
		}

		close(jobs)
	}()

	// convert map back to a list and save it as the apps current data
	tempData := make([]data.SymbolData, 0)

	for a := 1; a <= numJobs; a++ {
		v := <-results

		for key, bars := range v {
			if len(bars) > 100 { // TODO : are we throwing out too many here, probably doesn't matter
				tempData = append(tempData, data.SymbolData{
					Symbol:           key,
					Bars:             bars,
					CurrentPrice:     bars[len(bars)-1].Price,
					CurrentBuySignal: bars[len(bars)-1].BuySignal,
				})
			}

		}
	}

	return tempData, nil

}

func (a *App) worker(id int, jobs <-chan []string, results chan<- map[string][]data.MyBar, errors chan<- error, opts *data.AnalysisOptions) {
	for job := range jobs {
		//fmt.Println("worker", id, "started  job", job)
		resultsMap, e := a.AnalyzeSymbols(job, opts)
		if e != nil {
			errors <- e
		}
		//fmt.Println("worker", id, "finished job", job)
		results <- resultsMap
	}
}

// SimulateTrader kicks off the simulation
func (a *App) SimulateTrader() {
	opts := data.SimulationOptions{
		NumberOfIntervals: 330,
		IntervalFormat:    data.Minute,
		StartingCash:      float32(2000.0),
		MinBuySignal:      float32(0.1), // was 4 for daily
		MinCashLimit:      float32(100.0),
		MaxSharePrice:     float32(4000.0),
		Iterations:        3,
		ShowWorkLists:     true,
	}
	RunSimulation(CleanDates(a.currentData), &opts)

}

func (a *App) OperateDayTrader(opts *data.DayTraderOptions) {

	// anything holding at the beginning of the day is off the table (assumed in rh.txt)
	var wg sync.WaitGroup
	// ctx := context.Background()
	wg.Add(1)
	positions, e := services.GetPositions(a.robinhoodClient, &wg, a.account)
	wg.Wait()
	if e != nil {
		log.Panic(e)
	}
	a.currentPositions = positions

	holdSymbols := make([]string, 0)
	for _, p := range positions {
		fmt.Printf("%v\n", p.Symbol)
		if p.Symbol != "HST" && p.Symbol != "COTY" && p.Symbol != "SYY" {
			holdSymbols = append(holdSymbols, p.Symbol)
		}

	}
	a.forbiddenSymbols = holdSymbols

	// repeatedly invoke the trading routine every x seconds
	ticker := time.NewTicker(time.Duration(opts.Interval) * time.Second)
	quit := make(chan struct{})
	// a.DrawTable()
	a.DoTradingRoutine((opts))
	for {
		select {
		case <-ticker.C:
			a.DoTradingRoutine(opts)
			// a.DrawTable()
		case <-quit:
			ticker.Stop()
			return
		}
	}

}

func (a *App) DoTradingRoutine(opts *data.DayTraderOptions) {

	fmt.Println("Doing trading routine")
	var wg sync.WaitGroup
	// Step 1: pull data from alpaca / compute emas
	analysisOptions := data.AnalysisOptions{
		Filename:          "tickers2.txt",
		Timeframe:         "minute",
		Concurrency:       2,
		SymbolsPerRequest: 100,
		StartTime:         time.Now().AddDate(0, 0, -1),
		EndTime:           time.Now(),
		IsCrypto:          false,
	}
	wg.Add(1)
	data, _ := a.GrabDataAndAnalyze(&wg, &analysisOptions)
	wg.Wait()
	a.currentData = data

	// Step 2: pull holdings for designated portfolio / account from robinhood
	//ctx := context.Background()
	wg.Add(1)
	positions, _ := services.GetPositions(a.robinhoodClient, &wg, a.account)
	wg.Wait()

	for _, p := range positions {
		// decide whether to sell each position
		if helper.IsInList(p.Symbol, a.forbiddenSymbols) {
			// skip this position, its in our forbidden list
			continue
		}

		// find matching SymbolData in the current data
		for _, x := range a.currentData {
			if x.Symbol == p.Symbol {
				if x.CurrentBuySignal && opts.PerformTrades && p.Quantity > 0 {
					// sell this holding
					wg.Add(1)
					services.TradeQuantityAtPrice(a.robinhoodClient, &wg, a.DB, p.Symbol, p.Quantity, float64(p.CurrentPrice), robinhood.Sell)
				}
				break
			}
		}
	}
	wg.Wait() // wait to finish selling

	// use remaining buying power in portfolio to purchase as much of the best
	wg.Add(1)
	account, _ := services.GetMyAccount(a.robinhoodClient, &wg)
	a.account = account
	wg.Wait() // wait for account to be retrieved

	// sort data by best buy signals
	sort.SliceStable(a.currentData, func(k, j int) bool {
		return a.currentData[k].Bars[len(a.currentData[k].Bars)-1].DiffAdjusted < a.currentData[j].Bars[len(a.currentData[j].Bars)-1].DiffAdjusted
	})

	max := float32(0.0)
	balanceAvailable := float32(account.CashAvailableForWithdrawal)

	bestIndex := -1
	for j := 0; j < len(a.currentData); j++ {
		if a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Diff > opts.MinBuySignal &&
			a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Price < opts.MaxSharePrice &&
			a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Price < balanceAvailable &&
			a.currentData[j].Bars[len(a.currentData[j].Bars)-1].BuySignal &&
			a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Price < float32(account.BuyingPower) {
			bestIndex = j
		}
		if a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Diff > max {
			max = a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Diff
		}
	}

	fmt.Printf("max signal was %v\n", max, bestIndex)

	fmt.Printf("available : %v\n", balanceAvailable)
	fmt.Printf("account : %+v\n", a.account)

	if float32(balanceAvailable) > opts.MinCashLimit && bestIndex > -1 {
		// buy as much as we can of the good stuff if we have cash
		// TODO maybe canbuy should be on instrument current price instead
		canBuy := int(math.Floor(float64(float32(balanceAvailable) / a.currentData[bestIndex].Bars[len(a.currentData[bestIndex].Bars)-1].Price)))

		// tODO maybe ignore limit price and do it at whatever instrument currently is
		limitPrice := a.currentData[bestIndex].Bars[len(a.currentData[bestIndex].Bars)-1].Price

		// fmt.Printf("trying to buy %v of  %v at %v\n", canBuy, a.currentData[bestIndex].Symbol, limitPrice)

		if canBuy > 0 && opts.PerformTrades {
			wg.Add(1)
			services.TradeQuantityAtPrice(a.robinhoodClient, &wg, a.DB, a.currentData[bestIndex].Symbol, float32(canBuy), float64(limitPrice), robinhood.Buy)
			wg.Wait()
		}
	}

}

func (a *App) Stop() {
	fmt.Println("Ending matts market, have a good day!")
	os.Exit(0)
}

// AnalyzeSymbols will run analysis on a list of stock symbols
func (a *App) AnalyzeSymbols(symbols []string, options *data.AnalysisOptions) (map[string][]data.MyBar, error) {

	l := 1000

	params := alpaca.ListBarParams{
		Timeframe: options.Timeframe,
		StartDt:   &options.StartTime,
		EndDt:     &options.EndTime,
		Limit:     &l,
	}
	var results = make(map[string][]data.MyBar)
	var finalResults = make(map[string][]data.MyBar)

	if options.IsCrypto {
		// use tingo to get historical data
		st_str := options.StartTime.Format("2006-01-02 15:04")
		end_str := options.EndTime.Format("2006-01-02 15:04")

		qs, _ := gq.NewQuotesFromTiingoCryptoSyms(symbols, st_str, end_str, gq.Daily, os.Getenv("TIINGO_API_TOKEN"))

		// convert tiingo crypto series to mybars
		for _, q := range qs {
			results[q.Symbol] = make([]data.MyBar, 0)
			for i, close64 := range q.Close {
				price := float32(close64)
				results[q.Symbol] = append(results[q.Symbol], data.MyBar{
					Bar: alpaca.Bar{
						Time:  q.Date[i].Unix(),
						Close: price,
					},
					Price: price,
				})
			}
		}

	} else {
		// use alpaca to get historical data (assuming stocks if not crpto)
		// use alpaca to retrieve historical stock price data
		alpacaresults, err := a.alpacaClient.ListBars(symbols, params)
		if err != nil {
			panic(err)
			// log.Fatal(err)
		}

		// convert alpaca.bars to mybars
		for k, bars := range alpacaresults {
			results[k] = make([]data.MyBar, 0)
			for _, r := range bars {
				results[k] = append(results[k], data.MyBar{
					Bar: r,
				})
			}
		}
	}

	// now we perform analysis by going into each symbol's list of bars and adding emas / macds

	// do analysis for each of the companies
	for key, bars := range results {
		newbars := bars
		newbars = indicators.CalculateMACD(newbars)
		newbars = indicators.CalculateRSI(newbars)

		finalResults[key] = newbars
	}

	return finalResults, nil
}

// Initialize handles app initialization (alpaca client, db connection, etc)
func (a *App) Initialize(c *config.Config, wg *sync.WaitGroup) {
	defer wg.Done()
	// get mongo client connected
	db, err := db.GetDB(c.DB)
	if err != nil {
		log.Fatal("Could not connect database")
	}
	a.status = "Initializing"
	a.DB = db
	a.footer = "X - Exit     Esc - Go Back"
	a.currentData = make([]data.SymbolData, 0)
	a.minDataPointsToBuy = 30
	a.alpacaClient = alpaca.NewClient(common.Credentials())
	a.coinbaseClient = coinbase.ApiKeyClient(os.Getenv("COINBASE_KEY"), os.Getenv("COINBASE_SECRET"))

	a.robinhoodClient, err = services.InitializeRobinhoodClient()
	if err != nil {
		log.Fatal()
	}

	a.viewApp = tview.NewApplication()
	a.viewTable = tview.NewTable().SetBorders(false).SetSeparator(tview.Borders.Vertical)
	a.accountTable = tview.NewTable().SetBorders(false).SetSeparator(tview.Borders.Vertical)
	a.positionsTable = tview.NewTable().SetBorders(false).SetSeparator(tview.Borders.Vertical)
	a.cryptoTable = tview.NewTable().SetBorders(false).SetSeparator(tview.Borders.Vertical)
	a.statusText = tview.NewTextView().
		SetTextAlign(tview.AlignCenter).
		SetText(a.status)

}

func (a *App) StopGracefully() {
	a.viewApp.Stop()
	a.Stop()
}
