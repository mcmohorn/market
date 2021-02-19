package app

import (
	"bufio"
	"fmt"
	"log"
	"math"
	"os"
	"reflect"
	"sort"
	"strconv"
	"time"

	"github.com/gdamore/tcell"
	"github.com/rivo/tview"

	"github.com/alpacahq/alpaca-trade-api-go/alpaca"
	"github.com/alpacahq/alpaca-trade-api-go/common"
	"github.com/gorilla/mux"

	"github.com/mcmohorn/market/server/config"
	"github.com/mcmohorn/market/server/db"

	"go.mongodb.org/mongo-driver/mongo"
)

// App is our backend web application
type App struct {
	Router             *mux.Router
	DB                 *mongo.Database
	alpacaClient       *alpaca.Client
	viewApp            *tview.Application
	viewTable          *tview.Table
	minDataPointsToBuy int
	symbols            []string
	currentData        []SymbolData
}

// MyBar is an alpacabar with extra datapoints we add
type MyBar struct {
	alpaca.Bar
	emaFast          float32
	emaSlow          float32
	macdFast         float32
	macdSlow         float32
	buySignal        bool
	buySignalChanged []int64
	shares           int
	cash             float64
	diff             float32
	price            float32
	t                int64
}

type SymbolData struct {
	Symbol string
	Bars   []MyBar
}

func getField(v *MyBar, field string) float32 {
	r := reflect.ValueOf(v)
	f := reflect.Indirect(r).FieldByName(field)
	return float32(f.Float())
}

func (a *App) readTickers(filename string) []string {
	result := make([]string, 0)
	file, err := os.Open(filename)
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		result = append(result, scanner.Text())
	}

	if err := scanner.Err(); err != nil {
		log.Fatal(err)
	}
	return result
}

func (a *App) sortCurrentData() {
	// Sort by age, keeping original order or equal elements.
	sort.SliceStable(a.currentData, func(i, j int) bool {
		return a.currentData[i].Bars[len(a.currentData[i].Bars)-1].diff > a.currentData[j].Bars[len(a.currentData[j].Bars)-1].diff
	})
}

// AnalyzeTickersInFile reads a file where each line is a stock ticker and analyzes the bars to return better mybars
func (a *App) AnalyzeTickersInFile(filename string) (chan map[string][]MyBar, error) {
	symbols := a.readTickers(filename)
	concurrency := 3
	symbolsPerRequest := 101
	jobs := make(chan []string)
	results := make(chan map[string][]MyBar)
	errors := make(chan error)

	numJobs := int(math.Ceil(float64(len(symbols)) / float64(symbolsPerRequest)))

	fmt.Printf("%v symbols in %s needs %v jobs\n", len(symbols), filename, numJobs)
	// routine that populate our todo channel with the tickers
	go func() {

		// create the concurrent workers
		for x := 0; x < concurrency; x++ {
			go a.worker(x, jobs, results, errors)
		}

		currslice := make([]string, 0)
		for x := 0; x < numJobs; x++ {

			currslice = symbols[x*symbolsPerRequest : x*symbolsPerRequest+symbolsPerRequest]
			jobs <- currslice
		}

		close(jobs)
	}()

	// convert map back to a list and save it as the apps current data
	data := make([]SymbolData, 0)

	for a := 1; a <= numJobs; a++ {
		v := <-results
		for key, bars := range v {
			// fmt.Printf("%v %v\n", key, len(bars)) // todo, match up days because some are 243, some are 244 etc.
			if len(bars) > 250 {
				data = append(data, SymbolData{
					Symbol: key,
					Bars:   bars,
				})
			}

		}
	}

	a.currentData = data

	return results, nil

}

func (a *App) worker(id int, jobs <-chan []string, results chan<- map[string][]MyBar, errors chan<- error) {
	for job := range jobs {
		// fmt.Println("worker", id, "started  job", job)
		resultsMap, e := a.AnalyzeSymbols(job)
		if e != nil {
			errors <- e
		}
		// fmt.Println("worker", id, "finished job", job)
		results <- resultsMap
	}
}

// SimulateTrader kicks off the simulation
func (a *App) SimulateTrader() {

	RunSimulation(CleanDates(a.currentData))

}

// DrawTable draws this app's symbol data
func (a *App) DrawTable() {
	a.sortCurrentData()
	a.viewTable.SetCell(0, 0, tview.NewTableCell("Symbol").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 1, tview.NewTableCell("Action").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 2, tview.NewTableCell("Changed").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 3, tview.NewTableCell("changes").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 4, tview.NewTableCell("currdiff").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 5, tview.NewTableCell("lastdiff").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	//a.viewTable.SetCell(0, 6, tview.NewTableCell("").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 6, tview.NewTableCell("n").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))

	for _, s := range a.currentData {
		// set ticker column
		if len(s.Bars) > 0 {
			row := a.viewTable.GetRowCount()
			lastBar := s.Bars[len(s.Bars)-1]
			secondLastBar := s.Bars[len(s.Bars)-2]
			buymsg := "Buy"
			if !s.Bars[len(s.Bars)-1].buySignal {
				buymsg = "Sell"
			}

			changedTime := time.Unix(lastBar.buySignalChanged[len(lastBar.buySignalChanged)-1], 0)
			lastTime := time.Unix(s.Bars[len(s.Bars)-1].Bar.Time, 0)
			firstTime := time.Unix(s.Bars[0].Bar.Time, 0)
			diff := lastBar.macdFast - lastBar.macdSlow
			diff2 := secondLastBar.macdFast - secondLastBar.macdSlow
			// equity := float32(lastBar.cash) + float32(lastBar.shares)*lastBar.Bar.Close
			a.viewTable.SetCell(row, 0, tview.NewTableCell(s.Symbol).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignCenter))
			a.viewTable.SetCell(row, 1, tview.NewTableCell(buymsg).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignRight))
			a.viewTable.SetCell(row, 2, tview.NewTableCell(changedTime.Format("1-2-06")).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignRight))
			a.viewTable.SetCell(row, 3, tview.NewTableCell(strconv.Itoa(len(lastBar.buySignalChanged))).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignCenter))
			a.viewTable.SetCell(row, 4, tview.NewTableCell(fmt.Sprintf("%.2f", diff)).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignCenter))
			a.viewTable.SetCell(row, 5, tview.NewTableCell(fmt.Sprintf("%.2f", diff2)).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignCenter))
			// a.viewTable.SetCell(row, 6, tview.NewTableCell(fmt.Sprintf("%.2f", equity)).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignCenter))
			a.viewTable.SetCell(row, 6, tview.NewTableCell(fmt.Sprintf("%v", len(s.Bars))).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignCenter))
			a.viewTable.SetCell(row, 7, tview.NewTableCell(lastTime.Format("1-2-06")).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignRight))
			a.viewTable.SetCell(row, 8, tview.NewTableCell(firstTime.Format("1-2-06")).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignRight))
		}

	}

	// make the table the current view of the application
	if err := a.viewApp.SetRoot(a.viewTable, true).SetFocus(a.viewTable).Run(); err != nil {
		panic(err)
	}
}

// AnalyzeSymbols will run analysis on a sinlge stock symbol
func (a *App) AnalyzeSymbols(symbols []string) (map[string][]MyBar, error) {

	st := time.Now().AddDate(-1, 0, 0)
	end := time.Now()
	l := 1000

	params := alpaca.ListBarParams{
		Timeframe: "1D",
		StartDt:   &st,
		EndDt:     &end,
		Limit:     &l,
	}
	var results = make(map[string][]MyBar)
	var finalResults = make(map[string][]MyBar)

	alpacaresults, err := a.alpacaClient.ListBars(symbols, params)
	if err != nil {
		panic(err)
		// log.Fatal(err)
	}

	// convert alpaca bars to my bars for further analysis
	for k, bars := range alpacaresults {
		results[k] = make([]MyBar, 0)
		for _, r := range bars {
			results[k] = append(results[k], MyBar{
				Bar: r,
			})
		}
	}

	// setting our ema and macd parameters
	m1 := float32(12.0) // fast ema is ema1
	m2 := float32(26.0) // slow ema is ema2
	m3 := float32(9.0)  // length of ema for macdFast which gives us macdSlow
	a1 := 2.0 / (m1 + 1.0)
	a2 := 2.0 / (m2 + 1.0)
	a3 := 2.0 / (m3 + 1.0)

	// do analysis for each of the companies
	for key, bars := range results {
		//fmt.Println("Analyzing " + key + "...")
		newbars := make([]MyBar, 0)
		for i, bar := range bars {
			if i == 0 {
				newbars = append(newbars, MyBar{
					Bar:              bar.Bar,
					emaFast:          bar.Close,
					emaSlow:          bar.Close,
					macdFast:         0,
					macdSlow:         0,
					buySignal:        false,
					buySignalChanged: make([]int64, 0),
					cash:             0.0,
					shares:           0,
					diff:             0,
					price:            bar.Close,
					t:                bar.Time,
				})
			} else {
				emaf := a1*bar.Close + (1-a1)*newbars[i-1].emaFast
				emas := a2*bar.Close + (1-a2)*newbars[i-1].emaSlow
				macdf := emaf - emas
				macds := a3*macdf + (1-a3)*newbars[i-1].macdSlow
				newbar := MyBar{
					Bar:              bar.Bar,
					emaFast:          emaf,
					emaSlow:          emas,
					macdFast:         macdf,
					macdSlow:         macds,
					diff:             macdf - macds,
					buySignal:        false,
					buySignalChanged: make([]int64, 0),
					cash:             newbars[i-1].cash,
					shares:           newbars[i-1].shares,
					price:            bar.Close,
					t:                bar.Time,
				}

				// page 143 of Mak
				// bar.macdFast = bar.emaFast - bar.emaSlow
				// bar.macdSlow = a3*bar.macdFast + (1-a3)*bar.macdSlow
				// fmt.Printf("%f  and  %f\n", bar.macdFast, bar.macdSlow)
				if i > a.minDataPointsToBuy {
					if newbar.macdFast > newbar.macdSlow {
						// Time to Buy!
						newbar.buySignal = true
						if !newbars[i-1].buySignal {
							newbar.buySignalChanged = append(newbars[i-1].buySignalChanged, bar.Time)
						} else {
							newbar.buySignalChanged = newbars[i-1].buySignalChanged
						}
					} else {
						// Time to Sell!
						newbar.buySignal = false
						if newbars[i-1].buySignal {
							newbar.buySignalChanged = append(newbars[i-1].buySignalChanged, bar.Time)
						} else {
							newbar.buySignalChanged = newbars[i-1].buySignalChanged
						}
					}

					// buy one share at first buy signal
					if newbar.buySignal && newbars[i-1].shares == 0 {
						// buy a share
						newbar.shares = 1
						newbar.cash = newbars[i-1].cash - float64(newbar.Bar.Close)
					}

					if !newbar.buySignal && newbars[i-1].shares == 1 {
						// sell a share
						newbar.cash = newbars[i-1].cash + float64(newbar.Bar.Close)
						newbar.shares = 0
					}

				} else {
					newbar.buySignal = false
				}
				newbars = append(newbars, newbar)
			}
		}

		finalResults[key] = newbars

		// fmt.Printf("%-8s  %-5s  \n", key, currentBuyMessage)
		//PlotBars(bars, key)

	}

	total := float32(0.0)
	losers := 0
	for _, bars := range finalResults {
		equity := float32(bars[len(bars)-1].cash) + float32(bars[len(bars)-1].shares)*bars[len(bars)-1].Bar.Close
		total = total + equity
		if equity < 0 {
			losers = losers + 1
		}

	}

	return finalResults, nil
}

// Initialize handles app initialization (alpaca client, db connection, etc)
func (a *App) Initialize(c *config.Config) {

	// get mongo client connected
	db, err := db.GetDB(c.DB)
	if err != nil {
		log.Fatal("Could not connect database")
	}
	a.DB = db
	a.minDataPointsToBuy = 30
	a.alpacaClient = alpaca.NewClient(common.Credentials())

	a.viewApp = tview.NewApplication()
	a.viewTable = tview.NewTable().SetBorders(true)

	a.viewTable.Select(0, 0).SetFixed(1, 1).SetDoneFunc(func(key tcell.Key) {
		if key == tcell.KeyEscape {
			a.viewApp.Stop()
		}
		if key == tcell.KeyEnter {
			a.viewTable.SetSelectable(true, true)
		}
	}).SetSelectedFunc(func(row int, column int) {
		a.viewTable.GetCell(row, column).SetTextColor(tcell.ColorRed)
		a.viewTable.SetSelectable(false, false)
	})

}
