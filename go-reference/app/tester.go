package app

import (
	"github.com/mcmohorn/market/server/data"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"time"

	"github.com/mcmohorn/market/server/helper"
)

type WorkListItem struct {
	Symbol   string
	Price    float32
	Buy      bool
	Quantity int
	Time     string
}

// RunSimulation will run many simulations on the given SymbolData
func RunSimulation(data []data.SymbolData, options *data.SimulationOptions) {

	repetitions := options.Iterations // how many times to repeat experiment

	daysToTrade := options.NumberOfIntervals // how many days to trade in each repetition

	startingCash := float32(options.StartingCash) 

	worklists := make([][]WorkListItem, 0)

	losses := 0 // track how many times the algorithm lost equity over the given period
	gains := 0
	totalLost := float32(0) // track how many times the algorithm lost equity over the given period
	totalGain := float32(0)
	doubled := 0
	minBuySignal := float32(options.MinBuySignal) // TODO was 4
	maxSharePrice := float32(options.MaxSharePrice)
	minCashLimit := float32(options.MinCashLimit)
	cash := startingCash
	shares := make(map[string]int, 0)

	for r := 0; r < repetitions; r++ {
		cash = startingCash
		shares = make(map[string]int, 0)
		// choose a random starting day, allowing length of trading period
		day := rand.Intn(len(data[0].Bars) - daysToTrade - 1)

		workList := make([]WorkListItem, 0)

		for i := 0; i < daysToTrade ; i++ {
			d := day + i
			
			sort.SliceStable(data, func(k, j int) bool {
				return data[k].Bars[d].DiffAdjusted < data[j].Bars[d].DiffAdjusted
			})
			
			bestIndex := -1
			for j := 0; j < len(data); j++ {
				if data[j].Bars[d].Diff > minBuySignal && data[j].Bars[d].Price < maxSharePrice && data[j].Bars[d].BuySignal {
					bestIndex = j
				}
			}


			if cash > minCashLimit && bestIndex > -1 {
				// buy as much as we can of the good stuff if we have cash
				canBuy := int(math.Floor(float64(cash / data[bestIndex].Bars[d].NextPrice)))

				if canBuy > 0 {
					shares[data[bestIndex].Symbol] = shares[data[bestIndex].Symbol] + canBuy
					newWorkItem := WorkListItem{
						Buy:      true,
						Quantity: canBuy,
						Symbol:   data[bestIndex].Symbol,
						Price:    data[bestIndex].Bars[d].NextPrice,
						Time:     helper.PrettyTime2(data[bestIndex].Bars[d].Bar.Time),
					}
					workList = append(workList, newWorkItem)
					cash = cash - float32(canBuy)*data[bestIndex].Bars[d].NextPrice
				}

			}

			// check each of our holdings for sell signals
			for key, num := range shares {
				if num > 0 {
					currIndex := -1
					// find in data which symbol maches key
					for i, v := range data {
						if v.Symbol == key {
							currIndex = i
						}
					}

					if !data[currIndex].Bars[d].BuySignal {
						// time to sell
						cash = cash + float32(num)*data[currIndex].Bars[d].Price

						w := WorkListItem{
							Buy:      false,
							Quantity: num,
							Symbol:   data[currIndex].Symbol,
							Price:    data[currIndex].Bars[d].Price,
							Time:     helper.PrettyTime2(data[currIndex].Bars[d].Bar.Time),
						}
						workList = append(workList, w)
						shares[key] = 0 
					}
				}

			}
		}
		worklists = append(worklists, workList)

		totalAssets := cash
		for key, num := range shares {

			// find value of share
			currIndex := 0
			for i, v := range data {
				if v.Symbol == key {
					currIndex = i
				}
			}

			totalAssets = totalAssets + float32(num)*data[currIndex].Bars[len(data[currIndex].Bars)-1].Price
		}
		startTime := time.Unix(data[0].Bars[day].Time, 0)
		endTime := time.Unix(data[0].Bars[day+daysToTrade].Time, 0)
		fmt.Printf("%v - %v turned $%v into $%.0f and %v (trader %v)\n", startTime.Format("01/02/06"), endTime.Format("01/02/06"), startingCash, totalAssets, shares, r)

		if totalAssets < startingCash {
			losses = losses + 1
			totalLost += (startingCash - totalAssets)
		} else if totalAssets > startingCash {
			gains = gains + 1
			totalGain += (totalAssets - startingCash)
			if totalAssets > startingCash*2 {
				doubled = doubled + 1
			}
		}

	}

	if options.ShowWorkLists {
		PrintWorkLists(worklists)
	}
	lossPercent := 100.0 * float32(losses) / float32(repetitions)
	doubledPercent := 100.0 * float32(doubled) / float32(repetitions)

	averageLossAmount := totalLost / float32(losses)
	averageGainAmount := totalGain / float32(gains)

	if losses == 0 {
		averageLossAmount = 0
	}

	fmt.Printf(" - %.0f%% of the time\n", lossPercent)
	fmt.Printf("x2 %.0f%% of the time\n", doubledPercent)
	//fmt.Printf("x10 tendies   %.2f of the time\n", skyrockettedPercent)
	fmt.Printf("avg loss $%.0f\n", averageLossAmount)
	fmt.Printf("avg gain $%.0f\n", averageGainAmount)

	expectedAmount := lossPercent*averageLossAmount/100 + (1-lossPercent/100)*averageGainAmount
	expectedReturn := (startingCash + expectedAmount) / startingCash

	fmt.Printf("Expected Return Rate of %1.0f%% after %v days\n", 100.0*(expectedReturn-1), daysToTrade)
	

}

// PrintWorkLists just prints out the work lists
func PrintWorkLists(wls [][]WorkListItem) {
	for i, wl := range wls {
		fmt.Printf("\nTrader: %v\n", i)
		for _, item := range wl {
			fmt.Printf("@ %v : %v %v shares of %v at $%.2f\n", item.Time, helper.PrettyBoughtMessage(item.Buy), item.Quantity, item.Symbol, item.Price)
		}

	}
}

// CleanDates will eventually equalize the dates
func CleanDates(input []data.SymbolData) []data.SymbolData {
	d := make([]data.SymbolData, 0)
	d = input

	times := make([]int64, 0)

	for _, s := range d {
		for _, b := range s.Bars {

			found := false
			for _, t := range times {
				if t == b.Time {
					found = true
				}
			}
			if !found {
				times = append(times, b.Time)
			}
		}
		//fmt.Printf(" %v  has %v bars  (%v - %v)\n", s.Symbol, len(s.Bars), helper.PrettyTime2(s.Bars[0].Time), helper.PrettyTime2(s.Bars[len(s.Bars)-1].Time))
	}

	


	fmt.Printf("total of %v\n", len(times))

	sort.SliceStable(times, func(i, j int) bool {
		return times[i] < times[j]
	})

	// for _, l := range times {
	// 	fmt.Printf
	// }
	

	// fmt.Printf("analyzing dates for %v which has %v dates ends at %v\n", d[1].Symbol, len(d[1].Bars), helper.PrettyTime2(d[1].Bars[len(d[1].Bars)-1].Time))
	//for _, example := range d[0].Bars {
		//fmt.Printf("looking at %v\n", helper.PrettyTime2(example.Time))
		for u, item := range d {

			newBars := make([]data.MyBar, 0)

			currBar := item.Bars[0]

			for _, t := range times {

				for _, i := range item.Bars {
					if i.Bar.Time == t {

						currBar = i
					}
				}

				newBars = append(newBars, currBar)
			}
			d[u].Bars = newBars
			// if !found {

			// 	newBars := item.Bars
			// 	index := -1
			// 	for i, b := range newBars {
			// 		if b.Bar.Time > example.Time {
			// 			index = i
			// 			break
			// 		}
			// 	}
			// 	if index > -1 {
			// 		item.Bars = append(item.Bars, data.MyBar{})
			// 		copy(item.Bars[index+1:], item.Bars[index:])
			// 		item.Bars[index] = item.Bars[index-1]
			// 	} else {
			// 		// fmt.Printf("Could not fix %v for %v \n", helper.PrettyTime2(example.Time), item.Symbol)
			// 	}

			// }
		}


		

	//}
	return d

}
