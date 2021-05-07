package app

import (
	"fmt"
	"strconv"
	"time"

	"github.com/gdamore/tcell/v2"
	"github.com/mcmohorn/market/server/helper"
	"github.com/rivo/tview"
)

// newPrimitive creates a basic text view with the given string
func newPrimitive(text string) tview.Primitive {
	return tview.NewTextView().
		SetTextAlign(tview.AlignCenter).
		SetText(text)
}
func newPrimitiveWithColor(text string, col tcell.Color) tview.Primitive {
	return tview.NewTextView().
		SetTextAlign(tview.AlignCenter).
		SetText(text).SetTextColor(col)
}

const computerArt = ` ______________
||            ||
||    MATEO   ||
||            ||
||            ||
||____________||
|______________|
 \\############\\
  \\############\\
   	\      ____    \   
      \_____\___\____\`

const computerArt1 = `______________________
|                      |
|      M ax            |
|      A sset          |
|      T trade         |
|      E engine        |
|      O ptimizer      |
|______________________|
|______________________|
  \ --------------------- \
   \ --------------------  \
   \ --------------------- \
    \ --------------------- \
	 \       \        \      \
	  \_______\________\______\`

func (a *App) MakeWelcomeSelection(n int) {
	switch n {
	case 1:
		a.StartEndOfDayAnalysis()
	case 2:
		a.CryptoExperience()
	}
}

// DrawWelcomeScreen draws the welcome screen
func (a *App) DrawWelcomeScreen() {

	tv := tview.NewTextView().
		SetDynamicColors(true).
		SetTextColor(tcell.ColorGold).
		SetRegions(true).
		SetWordWrap(true).SetTextAlign(tview.AlignCenter).
		SetText("Maximized Algorithms for Trading Efficiently and Optimally")

	menu := tview.NewList().
		AddItem("Stocks", "", '1', func() {
			a.MakeWelcomeSelection(1)
		}).
		AddItem("Crypto", "", '2', func() {
			a.MakeWelcomeSelection(2)
		}).
		AddItem("Exit", "", 'x', func() {
			a.StopGracefully()
		}).SetSelectedFunc(func(i int, b string, c string, d rune) {
		a.MakeWelcomeSelection(i)
	})

	grid := tview.NewGrid().
		SetRows(1, 0, 1).
		SetColumns(1, 0, 0, 1).
		SetBorders(false).
		AddItem(newPrimitiveWithColor(computerArt, tcell.ColorSilver), 1, 1, 1, 1, 0, 0, false).
		AddItem(menu, 1, 2, 1, 1, 0, 0, false).
		AddItem(tv, 0, 1, 1, 1, 0, 0, false)

	a.SetupInputs()

	a.baseGrid = grid

	// grid is the basis of the view
	if err := a.viewApp.SetRoot(a.baseGrid, true).SetFocus(menu).EnableMouse(true).Run(); err != nil {
		panic(err)
	}

}

// MainMenuKeys controls inputs when the main menu is showing
func (a *App) MainMenuKeys(event *tcell.EventKey) *tcell.EventKey {
	switch event.Key() {
	case tcell.KeyEnter:
		break
	case tcell.KeyEscape:
		a.DrawWelcomeScreen()
		return nil
	case tcell.KeyRune:
		switch event.Rune() {
		case 'x':
			a.StopGracefully()
		default:
		}
	}

	return event
}

// TableKeys controls inputs for when a table is showing
func (a *App) TableKeys(event *tcell.EventKey) *tcell.EventKey {
	switch event.Key() {
	case tcell.KeyEnter:
		break
	case tcell.KeyEscape:
		a.DrawWelcomeScreen()
		return nil
	case tcell.KeyRune:
		switch event.Rune() {
		case 'x':
			a.StopGracefully()
		default:
		}
	}

	return event
}

func (a *App) SetupInputs() {
	a.viewApp.SetInputCapture(a.TableKeys)
}

// DrawTable draws basic table
func (a *App) DrawTable() {

	a.sortCurrentData(false)

	a.UpdatePositionsTableData()
	a.UpdateAccountTableData()
	a.UpdateTableData()
	//a.UpdateCryptoTableData()

	a.viewTable.Select(0, 0).SetFixed(1, 1).SetDoneFunc(func(key tcell.Key) {
		if key == tcell.KeyEscape {
			fmt.Println("do something")
			// a.viewApp.Stop()
			// a.Stop()
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

	grid := tview.NewGrid().
		SetRows(2, 0, 1).
		SetColumns(40, 0).
		SetBorders(true).
		AddItem(a.statusText, 0, 0, 1, 3, 0, 0, false).
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
		AddItem(candidatesSection, 1, 0, 1, 3, 0, 0, false)

	// Layout for screens wider than 100 cells.
	grid.AddItem(positionsSection, 1, 0, 1, 1, 0, 100, false).
		AddItem(candidatesSection, 1, 1, 1, 1, 0, 100, false)

	//a.baseGrid = grid

	a.baseGrid.Clear().AddItem(grid, 1, 1, 2, 2, 0, 0, true)

	// grid is the basis of the view
	// if err := a.viewApp.SetRoot(grid, true).EnableMouse(true); err != nil {
	// 	panic(err)
	// }

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

func (a *App) DrawCryptoTableHeaders() {
	a.cryptoTable.SetCell(0, 0, tview.NewTableCell("Currency").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.cryptoTable.SetCell(0, 1, tview.NewTableCell("MACD").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.cryptoTable.SetCell(0, 2, tview.NewTableCell(" $ ").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
	a.cryptoTable.SetCell(0, 3, tview.NewTableCell(" ? ").SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
}

func (a *App) UpdateAccountTableData() {

	a.accountTable.Clear()
	a.accountTable.SetCell(0, 0, tview.NewTableCell(a.account.AccountNumber).SetTextColor(tcell.ColorBlue).SetAlign(tview.AlignLeft))
}

func (a *App) UpdateCryptoTableData() {

	a.cryptoTable.Clear()
	a.DrawCryptoTableHeaders()
	a.sortData(a.currentCryptoData, false)
	for _, p := range a.currentCryptoData {
		rowColor := tcell.ColorWhite
		if helper.IsInList(p.Symbol, a.forbiddenSymbols) {
			rowColor = tcell.ColorGhostWhite
		}

		row := a.cryptoTable.GetRowCount()
		a.cryptoTable.SetCell(row, 0, tview.NewTableCell(p.Symbol).SetTextColor(rowColor).SetAlign(tview.AlignLeft))
		a.cryptoTable.SetCell(row, 2, tview.NewTableCell(fmt.Sprintf("%.2f", p.CurrentPrice)).SetTextColor(rowColor).SetAlign(tview.AlignRight))
		a.cryptoTable.SetCell(row, 1, tview.NewTableCell(fmt.Sprintf("%.2f", p.Bars[len(p.Bars)-1].DiffAdjusted)).SetTextColor(rowColor).SetAlign(tview.AlignRight))
		if len(p.Bars) > 0 {
			a.cryptoTable.SetCell(row, 4, tview.NewTableCell(helper.PrettyBuy(p.Bars[len(p.Bars)-1].BuySignal)).SetTextColor(rowColor).SetAlign(tview.AlignRight))
		}

	}

}

func (a *App) UpdatePositionsTableData() {

	a.positionsTable.Clear()
	a.DrawPositionsTableHeaders()
	sum := float32(0)
	for _, p := range a.currentPositions {
		rowColor := tcell.ColorWhite
		if helper.IsInList(p.Symbol, a.forbiddenSymbols) {
			rowColor = tcell.ColorGhostWhite
		}
		if p.Quantity == 0 {
			rowColor = tcell.ColorYellow
		}

		row := a.positionsTable.GetRowCount()
		a.positionsTable.SetCell(row, 0, tview.NewTableCell(p.Symbol).SetTextColor(rowColor).SetAlign(tview.AlignLeft))
		a.positionsTable.SetCell(row, 1, tview.NewTableCell(fmt.Sprintf("%.0f", p.Quantity)).SetTextColor(rowColor).SetAlign(tview.AlignRight))
		a.positionsTable.SetCell(row, 2, tview.NewTableCell(fmt.Sprintf("%.2f", p.CurrentPrice)).SetTextColor(rowColor).SetAlign(tview.AlignRight))
		sum = sum + (p.CurrentPrice * p.Quantity)
		a.positionsTable.SetCell(row, 3, tview.NewTableCell(fmt.Sprintf("%.2f", p.CurrentPrice*p.Quantity)).SetTextColor(rowColor).SetAlign(tview.AlignRight))
		if len(p.Data.Bars) > 0 {
			if !p.Data.Bars[len(p.Data.Bars)-1].BuySignal {
				rowColor = tcell.ColorRed
			}
			a.positionsTable.SetCell(row, 4, tview.NewTableCell(helper.PrettyBuy(p.Data.Bars[len(p.Data.Bars)-1].BuySignal)).SetTextColor(rowColor).SetAlign(tview.AlignRight))
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
