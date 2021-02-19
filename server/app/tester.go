package app

import (
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
}

// RunSimulation tries to determine the best trading strategy
func RunSimulation(data []SymbolData) {

	repetitions := 50 // how many times to repeat experiment

	//buffer := 1 // prevents us from randomly starting experiemt during first n days or last n days

	daysToTrade := 60 // how many days to trade in each repetition (should be at most buffer)

	startingCash := float32(2000.0)

	worklists := make([][]WorkListItem, 0)

	losses := 0 // track how many times the algorithm lost equity over the given period
	gains := 0
	totalLost := float32(0) // track how many times the algorithm lost equity over the given period
	totalGain := float32(0)
	doubled := 0
	tripled := 0
	skyrocketted := 0
	minBuySignal := float32(4.0)
	maxSharePrice := float32(1000.0)
	minCashLimit := float32(100)
	cash := startingCash
	shares := make(map[string]int, 0)

	for r := 0; r < repetitions; r++ {
		cash = startingCash
		shares = make(map[string]int, 0)
		// choose a random day
		day := rand.Intn(len(data[0].Bars) - daysToTrade)

		workList := make([]WorkListItem, 0)

		endReached := false

		for i := 0; i < daysToTrade && !endReached; i++ {
			d := day + i
			//fmt.Printf("Working on %v, %v\n", data[i].Symbol, len(data[i].Bars))
			// Sort bars by differences
			if d >= len(data[0].Bars) {
				endReached = true
			}
			sort.SliceStable(data, func(k, j int) bool {

				return data[k].Bars[d].diff < data[j].Bars[d].diff
			})

			// TODO:
			bestIndex := -1
			for j := 0; j < len(data); j++ {
				// could change this to average price not looking at latest
				if data[j].Bars[len(data[j].Bars)-1].diff > minBuySignal && data[j].Bars[len(data[j].Bars)-1].price < maxSharePrice {
					bestIndex = j
				}
			}

			if cash > minCashLimit && bestIndex > -1 {
				// buy as much as we can of the good stuff if we have cash
				canBuy := int(math.Floor(float64(cash / data[bestIndex].Bars[d].price)))

				if canBuy > 0 {
					shares[data[bestIndex].Symbol] = shares[data[bestIndex].Symbol] + canBuy
					newWorkItem := WorkListItem{
						Buy:      true,
						Quantity: canBuy,
						Symbol:   data[bestIndex].Symbol,
						Price:    data[bestIndex].Bars[d].price,
					}
					workList = append(workList, newWorkItem)
					cash = cash - float32(canBuy)*data[bestIndex].Bars[d].price
					//fmt.Printf("Bought %v of  %v at $%.2f\n", newWorkItem.Quantity, newWorkItem.Symbol, newWorkItem.Price)
				}

			}

			// check each of our holdings for sell signals
			for key, num := range shares {
				if num > 0 {
					currIndex := 0
					// find in data which symbol maches key
					for i, v := range data {
						if v.Symbol == key {
							currIndex = i
						}
					}

					if !data[currIndex].Bars[d].buySignal {
						// time to sell
						cash = cash + float32(num)*data[currIndex].Bars[d].price

						w := WorkListItem{
							Buy:      false,
							Quantity: num,
							Symbol:   data[currIndex].Symbol,
							Price:    data[currIndex].Bars[d].price,
						}
						workList = append(workList, w)
						//num = 0
						shares[key] = 0 //same thing?

						//fmt.Printf("Sold %v of  %v at $%.2f\n", w.Quantity, w.Symbol, w.Price)
					}
				}

			}

			//fmt.Printf("Holdings on day %v, are %v\n", d, shares)
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

			totalAssets = totalAssets + float32(num)*data[currIndex].Bars[len(data[currIndex].Bars)-1].price
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
			if totalAssets > startingCash*10 {
				skyrocketted = skyrocketted + 1
			} else if totalAssets > startingCash*3 {
				tripled = tripled + 1
			} else if totalAssets > startingCash*2 {
				doubled = doubled + 1
			}
		}

	}
	lossPercent := 100.0 * float32(losses) / float32(repetitions)
	//tripledPercent := 100.0 * float32(tripled) / float32(repetitions)
	doubledPercent := 100.0 * float32(doubled) / float32(repetitions)
	//skyrockettedPercent := 100.0 * float32(skyrocketted) / float32(repetitions)

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

	fmt.Printf("Expected Return Rate of %1.2f%% after %v days\n", expectedReturn-1, daysToTrade)

	// PrintWorkLists(worklists)

}

// PrintWorkLists just prints out the work lists
func PrintWorkLists(wls [][]WorkListItem) {
	for wl, i := range wls {
		fmt.Printf("\nTrader %v: %v\n", i, wl)
	}
}

// CleanDates will eventually equalize the dates
func CleanDates(input []SymbolData) []SymbolData {
	data := make([]SymbolData, 0)
	data = input

	//fmt.Printf("analyzing dates for %v which has %v dates", data[0].Symbol, len(data[0].Bars))
	for _, example := range data[0].Bars {
		// fmt.Printf("looking at %v\n", helper.PrettyTime(example.Time))
		for _, item := range data {
			found := false
			for _, i := range item.Bars {
				if i.Bar.Time == example.Time {
					found = true
				}
			}
			if !found {

				newBars := item.Bars
				index := -1
				for i, b := range newBars {
					if b.Bar.Time > example.Time {
						index = i
						break
					}
				}
				if index > -1 {
					item.Bars = append(item.Bars, MyBar{})
					copy(item.Bars[index+1:], item.Bars[index:])
					item.Bars[index] = item.Bars[index-1]
				} else {
					fmt.Printf("Could not fix %v for %v \n", helper.PrettyTime(example.Time), item.Symbol)
				}

			}
		}

	}
	return data

}
