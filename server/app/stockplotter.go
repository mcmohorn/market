package app

import (
	"github.com/mcmohorn/market/server/data"
	"math/rand"

	"gonum.org/v1/plot"
	"gonum.org/v1/plot/plotter"
	"gonum.org/v1/plot/plotutil"
	"gonum.org/v1/plot/vg"
)

// PlotBars will plot a given list of bars
func PlotBars(bars []data.MyBar, symbol string) {
	rand.Seed(int64(0))

	p, err := plot.New()
	if err != nil {
		panic(err)
	}

	p.Title.Text = symbol
	p.X.Label.Text = "Date"
	p.Y.Label.Text = "Price"

	err = plotutil.AddLinePoints(p, "Fast", GetPointsFromBars(bars, "macdFast"))
	if err != nil {
		panic(err)
	}

	err = plotutil.AddLinePoints(p, "Slow", GetPointsFromBars(bars, "macdSlow"))
	if err != nil {
		panic(err)
	}

	// Save the plot to a PNG file.
	if err := p.Save(10*vg.Inch, 10*vg.Inch, symbol+".png"); err != nil {
		panic(err)
	}

}

// GetPointsFromBars converts bars into points for the plot
func GetPointsFromBars(bars []data.MyBar, field string) plotter.XYs {
	pts := make(plotter.XYs, len(bars))
	for i := range pts {
		pts[i].X = float64(bars[i].Time)

		pts[i].Y = float64(getField(&bars[i], field))
	}
	return pts
}

// GetFASTMACD converts bars into points for the plot
func GetFASTMACD(bars []data.MyBar) plotter.XYs {
	pts := make(plotter.XYs, len(bars))
	for i := range pts {
		pts[i].X = float64(bars[i].Time)

		pts[i].Y = float64(bars[i].MacdFast)
	}
	return pts
}
