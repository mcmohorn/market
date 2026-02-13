package app

import (
	"sort"

	"github.com/mcmohorn/market/server/data"
)

func (a *App) sortCurrentDataNoAdjustment(ascending bool) {
	// Sort by age, keeping original order or equal elements.
	sort.SliceStable(a.currentData, func(i, j int) bool {
		if ascending {
			return a.currentData[i].Bars[len(a.currentData[i].Bars)-1].Diff < a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Diff
		}
		return a.currentData[i].Bars[len(a.currentData[i].Bars)-1].Diff > a.currentData[j].Bars[len(a.currentData[j].Bars)-1].Diff
	})
}

func (a *App) sortCurrentData(ascending bool) {
	// Sort by age, keeping original order or equal elements.
	sort.SliceStable(a.currentData, func(i, j int) bool {
		if ascending {
			return a.currentData[i].Bars[len(a.currentData[i].Bars)-1].DiffAdjusted < a.currentData[j].Bars[len(a.currentData[j].Bars)-1].DiffAdjusted
		}
		return a.currentData[i].Bars[len(a.currentData[i].Bars)-1].DiffAdjusted > a.currentData[j].Bars[len(a.currentData[j].Bars)-1].DiffAdjusted
	})
}

func (a *App) sortData(inputData []data.SymbolData, ascending bool) {
	// Sort by age, keeping original order or equal elements.
	sort.SliceStable(inputData, func(i, j int) bool {
		if ascending {
			return inputData[i].Bars[len(inputData[i].Bars)-1].DiffAdjusted < inputData[j].Bars[len(inputData[j].Bars)-1].DiffAdjusted
		}
		return inputData[i].Bars[len(inputData[i].Bars)-1].DiffAdjusted > inputData[j].Bars[len(inputData[j].Bars)-1].DiffAdjusted
	})
}

func (a *App) sortCurrentDataNumberOfDatapoints(ascending bool) {
	// Sort by age, keeping original order or equal elements.
	sort.SliceStable(a.currentData, func(i, j int) bool {
		if ascending {
			return len(a.currentData[i].Bars) < len(a.currentData[j].Bars)
		}
		return len(a.currentData[i].Bars) > len(a.currentData[j].Bars)
	})
}

func (a *App) sortCurrentDataAlphabetically(ascending bool) {
	// Sort by age, keeping original order or equal elements.
	sort.SliceStable(a.currentData, func(i, j int) bool {
		if ascending {
			return a.currentData[i].Symbol < a.currentData[j].Symbol
		}
		return a.currentData[i].Symbol > a.currentData[j].Symbol
	})
}

func (a *App) sortCurrentDataByChanged(ascending bool) {
	// Sort by age, keeping original order or equal elements.
	sort.SliceStable(a.currentData, func(i, j int) bool {
		if ascending {
			return a.currentData[i].Bars[len(a.currentData[i].Bars)-1].BuySignalChanged[len(a.currentData[i].Bars[len(a.currentData[i].Bars)-1].BuySignalChanged)-1] < a.currentData[j].Bars[len(a.currentData[j].Bars)-1].BuySignalChanged[len(a.currentData[j].Bars[len(a.currentData[j].Bars)-1].BuySignalChanged)-1]
		}
		return a.currentData[i].Bars[len(a.currentData[i].Bars)-1].BuySignalChanged[len(a.currentData[i].Bars[len(a.currentData[i].Bars)-1].BuySignalChanged)-1] > a.currentData[j].Bars[len(a.currentData[j].Bars)-1].BuySignalChanged[len(a.currentData[j].Bars[len(a.currentData[j].Bars)-1].BuySignalChanged)-1]
	})
}

func (a *App) sortCurrentDataNumberOfChanges(ascending bool) {
	// Sort by age, keeping original order or equal elements.
	sort.SliceStable(a.currentData, func(i, j int) bool {
		if ascending {
			return len(a.currentData[i].Bars[len(a.currentData[i].Bars)-1].BuySignalChanged) < len(a.currentData[j].Bars[len(a.currentData[j].Bars)-1].BuySignalChanged)
		}
		return len(a.currentData[i].Bars[len(a.currentData[i].Bars)-1].BuySignalChanged) > len(a.currentData[j].Bars[len(a.currentData[j].Bars)-1].BuySignalChanged)
	})
}
