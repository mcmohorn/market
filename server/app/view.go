package app

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gdamore/tcell"
	"github.com/mcmohorn/market/server/helper"
	"github.com/rivo/tview"
)

// newPrimitive creates a basic text view with the given string
func newPrimitive(text string) tview.Primitive {
	return tview.NewTextView().
		SetTextAlign(tview.AlignCenter).
		SetText(text)
}

// DrawWelcomeScreen draws the welcome screen
func (a *App) DrawWelcomeScreen() {

	tv := tview.NewTextView().
		SetDynamicColors(true).
		SetRegions(true).
		SetWordWrap(true).
		SetText("Maximium\n\nAlgorithmic\n\nTrading\n\nEfficiency\n\nOptimization")

	grid := tview.NewGrid().
		SetRows(5, 1, 0, 1, 0, 1).
		SetColumns(1, 0, 20, 20, 0, 1).
		SetBorders(false).
		AddItem(newPrimitive(""), 0, 0, 1, 6, 0, 0, false).
		AddItem(newPrimitive(""), 1, 0, 1, 6, 0, 0, false).
		AddItem(newPrimitive(""), 2, 0, 1, 2, 0, 0, false).
		AddItem(newPrimitive("MATEO -"), 2, 2, 1, 1, 0, 0, false).
		AddItem(tv, 2, 3, 1, 1, 0, 0, false).
		AddItem(newPrimitive(""), 2, 4, 1, 1, 0, 0, false).
		AddItem(newPrimitive(""), 2, 5, 1, 1, 0, 0, false).
		AddItem(newPrimitive("Any key to start"), 3, 0, 1, 6, 0, 0, false).
		AddItem(newPrimitive(a.footer), 4, 0, 1, 6, 0, 0, false)

	a.viewApp.SetInputCapture(func(event *tcell.EventKey) *tcell.EventKey {
		if event.Key() == tcell.KeyCtrlX {
			a.Stop()
			return nil
		} else if event.Key() == tcell.KeyEnter {
			//a.DrawTable()
			a.StartEndOfDayAnalysis()
			return nil
		}

		return event
	})

	// grid is the basis of the view
	if err := a.viewApp.SetRoot(grid, true).EnableMouse(true).Run(); err != nil {
		panic(err)
	}
}

// DrawTable draws this app's symbol data
func (a *App) DrawTable() {

	a.sortCurrentData(false)

	a.UpdatePositionsTableData()
	a.UpdateTableData()

	a.viewTable.Select(0, 0).SetFixed(1, 1).SetDoneFunc(func(key tcell.Key) {
		if key == tcell.KeyEscape {
			a.viewApp.Stop()
			a.Stop()
		}
		if key == tcell.KeyEnter {
			a.viewTable.SetSelectable(true, true)
		}
	}).SetSelectedFunc(func(row int, column int) {
		if column == 0 {
			a.sortSymbolAscending = !a.sortSymbolAscending
			a.sortCurrentDataAlphabetically(a.sortSymbolAscending)
			a.UpdateTableData()
		}

		if column == 2 {
			a.sortChangedAscending = !a.sortChangedAscending
			a.sortCurrentDataByChanged(a.sortChangedAscending)
			a.UpdateTableData()
		}

		if column == 3 {
			a.sortNChangesAscending = !a.sortNChangesAscending
			a.sortCurrentDataNumberOfChanges(a.sortNChangesAscending)
			a.UpdateTableData()
		}

		if column == 4 {
			a.sortDiffAscending = !a.sortDiffAscending
			a.sortCurrentDataNoAdjustment(a.sortDiffAscending)
			a.UpdateTableData()
		}

		if column == 5 {
			a.sortDiffAdjustedAscending = !a.sortDiffAdjustedAscending
			a.sortCurrentData(a.sortDiffAdjustedAscending)
			a.UpdateTableData()
		}

		if column == 6 {
			a.sortNAscending = !a.sortNAscending
			a.sortCurrentDataNumberOfDatapoints(a.sortNAscending)
			a.UpdateTableData()
		}
	})

	newPrimitive := func(text string) tview.Primitive {
		return tview.NewTextView().
			SetTextAlign(tview.AlignCenter).
			SetText(text)
	}
	//menu := newPrimitive("Holdings")
	sideBar := newPrimitive("Side Bar")

	grid := tview.NewGrid().
		SetRows(2, 0, 1).
		SetColumns(40, 0, 30).
		SetBorders(true).
		AddItem(newPrimitive(a.header), 0, 0, 1, 3, 0, 0, false).
		AddItem(newPrimitive(a.footer), 2, 0, 1, 3, 0, 0, false)

		// current holdings section
	positionsSection := tview.NewGrid().
		SetRows(1, 0).
		SetColumns(0).
		SetBorders(false).
		AddItem(newPrimitive("Positions"), 0, 0, 1, 1, 0, 0, false).
		AddItem(a.positionsTable, 1, 0, 1, 1, 0, 0, false)

		// main section
	candidatesSection := tview.NewGrid().
		SetRows(1, 0).
		SetColumns(0).
		SetBorders(false).
		AddItem(newPrimitive("Hot List"), 0, 0, 1, 1, 0, 0, false).
		AddItem(a.viewTable, 1, 0, 1, 1, 0, 0, false)

	// Layout for screens narrower than 100 cells (menu and side bar are hidden).
	grid.AddItem(positionsSection, 0, 0, 0, 0, 0, 0, false).
		AddItem(candidatesSection, 1, 0, 1, 3, 0, 0, false).
		AddItem(sideBar, 0, 0, 0, 0, 0, 0, false)

	// Layout for screens wider than 100 cells.
	grid.AddItem(positionsSection, 1, 0, 1, 1, 0, 100, false).
		AddItem(candidatesSection, 1, 1, 1, 1, 0, 100, false).
		AddItem(sideBar, 1, 2, 1, 1, 0, 100, false)

	// grid is the basis of the view
	if err := a.viewApp.SetRoot(grid, true).EnableMouse(true).Run(); err != nil {
		panic(err)
	}

}

func (a *App) DrawTableHeaders() {
	a.viewTable.SetCell(0, 0, tview.NewTableCell("Symbol").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 1, tview.NewTableCell("Action").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 2, tview.NewTableCell("Changed").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 3, tview.NewTableCell("changes").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 4, tview.NewTableCell("diff").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 5, tview.NewTableCell("diffA").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.viewTable.SetCell(0, 6, tview.NewTableCell("n").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
}

func (a *App) DrawPositionsTableHeaders() {
	a.positionsTable.SetCell(0, 0, tview.NewTableCell("    ").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.positionsTable.SetCell(0, 1, tview.NewTableCell("Shares").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.positionsTable.SetCell(0, 2, tview.NewTableCell(" Price ").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.positionsTable.SetCell(0, 3, tview.NewTableCell(" Total  ").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.positionsTable.SetCell(0, 4, tview.NewTableCell("Action").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
}

func (a *App) UpdatePositionsTableData() {

	a.positionsTable.Clear()
	a.DrawPositionsTableHeaders()
	sum := float32(0)
	for _, p := range a.currentPositions {
		row := a.positionsTable.GetRowCount()
		a.positionsTable.SetCell(row, 0, tview.NewTableCell(p.Symbol).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignLeft))
		a.positionsTable.SetCell(row, 1, tview.NewTableCell(fmt.Sprintf("%.0f", p.Quantity)).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignRight))
		a.positionsTable.SetCell(row, 2, tview.NewTableCell(fmt.Sprintf("%.2f", p.CurrentPrice)).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignRight))
		sum = sum + (p.CurrentPrice * p.Quantity)
		a.positionsTable.SetCell(row, 3, tview.NewTableCell(fmt.Sprintf("%.2f", p.CurrentPrice*p.Quantity)).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignRight))
		if len(p.Data.Bars) > 0 {
			a.positionsTable.SetCell(row, 4, tview.NewTableCell(helper.PrettyBuy(p.Data.Bars[len(p.Data.Bars)-1].BuySignal)).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignRight))

		}

	}

	a.positionsTable.SetCell(a.positionsTable.GetRowCount(), 3, tview.NewTableCell(fmt.Sprintf("%.2f", sum)).SetTextColor(tcell.ColorGreen)).SetTitleAlign((tview.AlignRight))
}

func (a *App) UpdateTableData() {
	a.viewTable.Clear()
	a.DrawTableHeaders()

	for _, s := range a.currentData {
		if len(s.Bars) > 0 {
			row := a.viewTable.GetRowCount()
			lastBar := s.Bars[len(s.Bars)-1]
			buymsg := helper.PrettyBuy(s.Bars[len(s.Bars)-1].BuySignal)
			changedTimestamp := lastBar.BuySignalChanged[len(lastBar.BuySignalChanged)-1]
			changedTime := time.Unix(changedTimestamp, 0)
			diff := lastBar.MacdFast - lastBar.MacdSlow

			a.viewTable.SetCell(row, 0, tview.NewTableCell(s.Symbol).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignCenter))
			a.viewTable.SetCell(row, 1, tview.NewTableCell(buymsg).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignRight))
			a.viewTable.SetCell(row, 2, tview.NewTableCell(changedTime.Format("1-2-06")).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignRight))
			a.viewTable.SetCell(row, 3, tview.NewTableCell(strconv.Itoa(len(lastBar.BuySignalChanged))).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignCenter))
			a.viewTable.SetCell(row, 4, tview.NewTableCell(fmt.Sprintf("%.2f", diff)).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignCenter))
			a.viewTable.SetCell(row, 5, tview.NewTableCell(fmt.Sprintf("%.2f", lastBar.DiffAdjusted)).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignCenter))
			a.viewTable.SetCell(row, 6, tview.NewTableCell(fmt.Sprintf("%v", len(s.Bars))).SetTextColor(tcell.ColorWhite).SetAlign(tview.AlignCenter))
		}

	}
}
