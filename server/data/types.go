package data

import (
	"time"

	"github.com/alpacahq/alpaca-trade-api-go/alpaca"
	"github.com/andrewstuart/go-robinhood"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

// MyBar is like an alpacabar with extra analysis values
type MyBar struct {
	alpaca.Bar
	EmaFast          float32
	EmaSlow          float32
	MacdFast         float32
	MacdSlow         float32
	BuySignal        bool
	BuySignalChanged []int64
	Shares           int
	Cash             float64
	Diff             float32
	DiffAdjusted     float32
	Price            float32
	NextPrice        float32
	T                int64
}

// MyPosition is like a robinhood position unified with a robinhood quote
type MyPosition struct {
	Symbol       string
	Quantity     float32
	CurrentPrice float32
	Instrument   *robinhood.Instrument
	Data         SymbolData
}

type OrderEvent struct {
	ID           primitive.ObjectID  `bson:"_id,omitempty"`
	Symbol       string              `bson:"symbol,omitempty"`
	Completed    int64               `bson:"completed,omitempty"`
	Quantity     float32             `bson:"quantity,omitempty"`
	ErrorMessage string              `bson:"errorMEssage,omitEmpty"`
	Price        float32             `bson:"price,omitempty"`
	Side         robinhood.OrderSide `bson:"side,omitempty"`
}

type OrderError struct {
	ID      primitive.ObjectID `bson:"_id,omitempty"`
	Message string             `bson:"message,omitempty"`
	Time    int64              `bson:"completed,omitempty"`
}

type SymbolData struct {
	Symbol           string
	Bars             []MyBar
	CurrentBuySignal bool
	CurrentPrice     float32
}

type IntervalFormat int

const (
	Day IntervalFormat = iota
	Minute
)

type SimulationOptions struct {
	IntervalFormat    IntervalFormat
	NumberOfIntervals int
	MaxSharePrice     float32
	StartingCash      float32
	MinBuySignal      float32
	MinCashLimit      float32
	Iterations        int
	ShowWorkLists     bool
}

// AnalysisOptions is the object that configures the analysis step where we concurrently analyze many symbols using a 3rd party (Alpaca)
type AnalysisOptions struct {
	Timeframe         string
	Filename          string
	Concurrency       int
	SymbolsPerRequest int
	PrintSymbolMath   bool
	StartTime         time.Time
	EndTime           time.Time
}

type DayTraderOptions struct {
	PerformTrades bool
	Interval      int
	MaxSharePrice float32
	MinBuySignal  float32
	MinCashLimit  float32
}
