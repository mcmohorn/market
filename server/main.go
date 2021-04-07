package main

import (
	"fmt"
	"math/rand"
	"os"
	"sync"
	"time"

	"github.com/alpacahq/alpaca-trade-api-go/alpaca"
	"github.com/alpacahq/alpaca-trade-api-go/common"
	"github.com/mcmohorn/market/server/app"
	"github.com/mcmohorn/market/server/config"
)

func init() {
	os.Setenv(common.EnvApiKeyID, os.Getenv("ALPACA_API_KEY_ID"))
	os.Setenv(common.EnvApiSecretKey, os.Getenv("ALPACA_API_KEY_SECRET"))

	alpaca.SetBaseUrl("https://api.alpaca.markets")
}

func main() {
	fmt.Println("Starting Matt's Market :)")
	rand.Seed(time.Now().UnixNano()) // initialize random number generation
	config := config.GetConfig()

	// create an instance of the application that will do most of the work
	app := &app.App{}
	rand.Seed(time.Now().UnixNano())
	var initWG sync.WaitGroup
	initWG.Add(1)
	app.Initialize(config, &initWG)
	initWG.Wait()

	//app.StartEndOfDayAnalysis()
	//app.StartDayTrader()

}
