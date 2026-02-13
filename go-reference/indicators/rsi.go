package indicators

import "github.com/mcmohorn/market/server/data"

func CalculateRSI(bars []data.MyBar) []data.MyBar {
	// setting our ema and macd parameters
	m1 := float32(12.0) // fast ema is ema1 (12)
	a1 := 1.0 / m1

	// fmt.Println("Analyzing " + key + "...")
	newbars := make([]data.MyBar, 0)
	totalGains := float32(0.0)
	totalLosses := float32(0.0)
	for i, bar := range bars {
		newbar := bar

		if i == 0 {

			newbar.SMMAD = 0
			newbar.SMMAU = 0
			newbar.RSI = 0.0

		} else {

			closeNow := bars[i].Close
			closePrevious := bars[i-1].Close
			U := float32(0.0)
			D := float32(0.0)
			if closeNow > closePrevious {
				U = closeNow - closePrevious
			} else if closeNow < closePrevious {
				D = closePrevious - closeNow
			}
			totalGains = totalGains + U
			totalLosses = totalLosses + D

			if i < 14 {
				newbar.SMMAD = float32(totalLosses) / float32(i)
				newbar.SMMAU = float32(totalGains) / float32(i)
			} else {
				newbar.SMMAD = a1*D + (1-a1)*newbars[i-1].SMMAD
				newbar.SMMAU = a1*U + (1-a1)*newbars[i-1].SMMAU

				RS := newbar.SMMAU / newbar.SMMAD

				newbar.RSI = 100.0 - (100.0 / (1.0 + RS))
			}

		}
		newbars = append(newbars, newbar)
	}
	return newbars
}
