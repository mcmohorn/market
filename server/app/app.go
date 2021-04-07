package app

import (
	"context"
	"fmt"
	"log"
	"math"
	"os"
	"reflect"
	"sort"
	"sync"
	"time"

	"github.com/andrewstuart/go-robinhood"

	"github.com/rivo/tview"

	"github.com/alpacahq/alpaca-trade-api-go/alpaca"
	"github.com/alpacahq/alpaca-trade-api-go/common"
	"github.com/gorilla/mux"

	"github.com/mcmohorn/market/server/config"
	"github.com/mcmohorn/market/server/data"
	"github.com/mcmohorn/market/server/db"
	"github.com/mcmohorn/market/server/helper"
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
	viewTable          *tview.Table
	positionsTable     *tview.Table
	robinhoodClient    *robinhood.Client
	minDataPointsToBuy int
	Timeframe          string
	forbiddenSymbols   []string
	currentData        []data.SymbolData
	currentPositions   []data.MyPosition

	header string
	footer string

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
		MinCashLimit:  100,
		MaxSharePrice: 2000,
		MinBuySignal:  0.1,
		PerformTrades: false,
	}
	a.header = "Minutely"
	a.Timeframe = "minute"
	a.OperateDayTrader(&options)

}

func (a *App) StartEndOfDayAnalysis() {

	options := data.AnalysisOptions{
		Filename:          "tickers2.txt",
		Concurrency:       2,
		Timeframe:         "1D",
		SymbolsPerRequest: 100,
		StartTime:         time.Now().AddDate(-1, 0, 0), // one year ago
		EndTime:           time.Now(),                   // until today
	}

	a.header = "Daily"

	var wg sync.WaitGroup
	ctx := context.Background()
	wg.Add(1)
	ps, e := services.GetPositions(ctx, a.robinhoodClient, &wg)
	wg.Wait()
	if e != nil {
		log.Panic(e)
	}
	a.currentPositions = ps

	wg.Add(1)
	data, _ := a.GrabDataAndAnalyze(&wg, &options)
	wg.Wait()
	a.currentData = data

	a.UpdateCurrentPositionsFromCurrentData()

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

// AnalyzeTickersInFile reads a file where each line is a stock ticker and analyzes the bars to return better mybars
func (a *App) GrabDataAndAnalyze(wg *sync.WaitGroup, opts *data.AnalysisOptions) ([]data.SymbolData, error) {
	defer wg.Done()
	filename := opts.Filename
	symbols := reader.ReadTickersFromFile(filename)
	concurrency := opts.Concurrency
	symbolsPerRequest := opts.SymbolsPerRequest
	jobs := make(chan []string)
	results := make(chan map[string][]data.MyBar)
	errors := make(chan error)

	numJobs := int(math.Ceil(float64(len(symbols)) / float64(symbolsPerRequest)))

	if opts.PrintSymbolMath {
		fmt.Printf("%v symbols in %s needs %v jobs\n", len(symbols), filename, numJobs)
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
	ctx := context.Background()
	wg.Add(1)
	positions, e := services.GetPositions(ctx, a.robinhoodClient, &wg)
	wg.Wait()
	if e != nil {
		log.Panic(e)
	}
	a.currentPositions = positions

	holdSymbols := make([]string, 0)
	for _, p := range positions {
		fmt.Printf("%v\n", p.Symbol)
		if p.Symbol != "WYNN" {
			holdSymbols = append(holdSymbols, p.Symbol)
		}

	}
	a.forbiddenSymbols = holdSymbols

	// repeatedly invoke the trading routine every x seconds
	ticker := time.NewTicker(time.Duration(opts.Interval) * time.Second)
	quit := make(chan struct{})
	a.DrawTable()
	a.DoTradingRoutine((opts))
	for {
		select {
		case <-ticker.C:
			a.DoTradingRoutine(opts)
			a.DrawTable()
		case <-quit:
			ticker.Stop()
			return
		}
	}

}

func (a *App) DoTradingRoutine(opts *data.DayTraderOptions) {

	var wg sync.WaitGroup
	// Step 1: pull data from alpaca / compute emas
	analysisOptions := data.AnalysisOptions{
		Filename:          "tickers2.txt",
		Timeframe:         "minute",
		Concurrency:       2,
		SymbolsPerRequest: 100,
		StartTime:         time.Now().AddDate(0, 0, -1),
		EndTime:           time.Now(),
	}
	wg.Add(1)
	data, _ := a.GrabDataAndAnalyze(&wg, &analysisOptions)
	wg.Wait()
	a.currentData = data
	// a.currentData is now up to date

	// Step 2: pull holdings for designated portfolio / account from robinhood
	ctx := context.Background()
	wg.Add(1)
	positions, _ := services.GetPositions(ctx, a.robinhoodClient, &wg)
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
				if x.CurrentBuySignal && opts.PerformTrades {
					// sell this holding
					wg.Add(1)
					services.TradeQuantityAtPrice(ctx, a.robinhoodClient, &wg, a.DB, p.Symbol, p.Quantity, float64(p.CurrentPrice), robinhood.Sell)
				}
				break
			}
		}
	}
	wg.Wait() // wait to finish selling

	// use remaining buying power in portfolio to purchase as much of the best
	wg.Add(1)
	account, _ := services.GetMyAccount(ctx, a.robinhoodClient, &wg)
	wg.Wait() // wait for account to be retrieved

	// sort data by best buy signals
	sort.SliceStable(a.currentData, func(k, j int) bool {
		return a.currentData[k].Bars[len(a.currentData[k].Bars)-1].DiffAdjusted < a.currentData[j].Bars[len(a.currentData[j].Bars)-1].DiffAdjusted
	})

	max := float32(0.0)

	bestIndex := -1
	for j := 0; j < len(a.currentData); j++ {
		if a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Diff > opts.MinBuySignal &&
			a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Price < opts.MaxSharePrice &&
			a.currentData[j].Bars[len(a.currentData[j].Bars)-1].BuySignal &&
			a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Price < float32(account.BuyingPower) {
			bestIndex = j
		}
		if a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Diff > max {
			max = a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Diff
		}
	}

	balanceAvailable := account.MarginBalances.DayTradeBuyingPower

	if float32(balanceAvailable) > opts.MinCashLimit && bestIndex > -1 {
		// buy as much as we can of the good stuff if we have cash
		// TODO maybe canbuy should be on instrument current price instead
		canBuy := int(math.Floor(float64(float32(balanceAvailable) / a.currentData[bestIndex].Bars[len(a.currentData[bestIndex].Bars)-1].Price)))

		// tODO maybe ignore limit price and do it at whatever instrument currently is
		limitPrice := a.currentData[bestIndex].Bars[len(a.currentData[bestIndex].Bars)-1].Price

		// fmt.Printf("trying to buy %v of  %v at %v\n", canBuy, a.currentData[bestIndex].Symbol, limitPrice)

		if canBuy > 0 && opts.PerformTrades {
			wg.Add(1)
			services.TradeQuantityAtPrice(ctx, a.robinhoodClient, &wg, a.DB, a.currentData[bestIndex].Symbol, float32(canBuy), float64(limitPrice), robinhood.Buy)
			wg.Wait()
		}
	}

}

func (a *App) Stop() {
	fmt.Println("Ending matts market, have a good day!")
	os.Exit(2)
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

	// now we perform analysis by going into each symbol's list of bars and adding emas / macds

	// setting our ema and macd parameters
	m1 := float32(12.0) // fast ema is ema1 (12)
	m2 := float32(26.0) // slow ema is ema2 (26)
	m3 := float32(9.0)  // length of ema for macdFast which gives us macdSlow
	a1 := 2.0 / (m1 + 1.0)
	a2 := 2.0 / (m2 + 1.0)
	a3 := 2.0 / (m3 + 1.0)

	// do analysis for each of the companies
	for key, bars := range results {
		// fmt.Println("Analyzing " + key + "...")
		newbars := make([]data.MyBar, 0)
		for i, bar := range bars {
			if i == 0 {
				newbars = append(newbars, data.MyBar{
					Bar:              bar.Bar,
					EmaFast:          bar.Close,
					EmaSlow:          bar.Close,
					MacdFast:         0,
					MacdSlow:         0,
					BuySignal:        false,
					BuySignalChanged: make([]int64, 0),
					Cash:             0.0,
					Shares:           0,
					Diff:             0,
					DiffAdjusted:     0,
					Price:            bar.Close,
					NextPrice:        0,
					T:                bar.Time,
				})
			} else {
				// page 143 of Mak (compute emas and macds)
				emaf := a1*bar.Close + (1-a1)*newbars[i-1].EmaFast
				emas := a2*bar.Close + (1-a2)*newbars[i-1].EmaSlow
				macdf := emaf - emas
				macds := a3*macdf + (1-a3)*newbars[i-1].MacdSlow
				newbar := data.MyBar{
					Bar:              bar.Bar,
					EmaFast:          emaf,
					EmaSlow:          emas,
					MacdFast:         macdf,
					MacdSlow:         macds,
					Diff:             macdf - macds,
					DiffAdjusted:     (macdf - macds) / bar.Close,
					BuySignal:        false,
					BuySignalChanged: make([]int64, 0),
					Cash:             newbars[i-1].Cash,
					Shares:           newbars[i-1].Shares,
					Price:            bar.Close,
					T:                bar.Time,
				}

				// grab next price if available - it's useful in daily simulations to buy at opening price
				if i < len(bars)-1 {
					newbar.NextPrice = bars[i+1].Open
				} else {
					newbar.NextPrice = bars[i].Close
				}

				// decide on buy / sell indicators
				if i > a.minDataPointsToBuy {
					if newbar.MacdFast > newbar.MacdSlow {
						// Time to Buy!
						newbar.BuySignal = true
						if !newbars[i-1].BuySignal {
							newbar.BuySignalChanged = append(newbars[i-1].BuySignalChanged, bar.Time)
						} else {
							newbar.BuySignalChanged = newbars[i-1].BuySignalChanged
						}
					} else {
						// Time to Sell!
						newbar.BuySignal = false
						if newbars[i-1].BuySignal {
							newbar.BuySignalChanged = append(newbars[i-1].BuySignalChanged, bar.Time)
						} else {
							newbar.BuySignalChanged = newbars[i-1].BuySignalChanged
						}
					}

				} else {
					newbar.BuySignal = false
				}
				newbars = append(newbars, newbar)
			}
		}

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
	a.DB = db
	a.footer = "Ctrl-X: Exit"
	a.currentData = make([]data.SymbolData, 0)
	a.minDataPointsToBuy = 30
	a.alpacaClient = alpaca.NewClient(common.Credentials())

	a.robinhoodClient, err = services.InitializeRobinhoodClient(context.Background())

	a.viewApp = tview.NewApplication()
	a.viewTable = tview.NewTable().SetBorders(false).SetSeparator(tview.Borders.Vertical)
	a.positionsTable = tview.NewTable().SetBorders(false).SetSeparator(tview.Borders.Vertical)

	a.DrawWelcomeScreen()

}
