package indicators

import "github.com/mcmohorn/market/server/data"

func CalculateMACD(bars []data.MyBar) []data.MyBar {
	// setting our ema and macd parameters
	m1 := float32(12.0) // fast ema is ema1 (12)
	m2 := float32(26.0) // slow ema is ema2 (26)
	m3 := float32(9.0)  // length of ema for macdFast which gives us macdSlow
	a1 := 2.0 / (m1 + 1.0)
	a2 := 2.0 / (m2 + 1.0)
	a3 := 2.0 / (m3 + 1.0)
	minDataPointsToBuy := 10

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
			if i > minDataPointsToBuy {
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
	return newbars
}
