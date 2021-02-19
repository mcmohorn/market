package db

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/mcmohorn/market/server/config"
	"go.mongodb.org/mongo-driver/mongo/readpref"

	"go.mongodb.org/mongo-driver/mongo/options"

	"go.mongodb.org/mongo-driver/mongo"
)

// GetDB gets the db connection
func GetDB(*config.DBConfig) (*mongo.Database, error) {
	ctx, _ := context.WithTimeout(context.Background(), 10*time.Second)
	uri := "mongodb://" + os.Getenv("MONGO_DB_USERNAME") + ":" + os.Getenv("MONGO_DB_PASSWORD") + "@" + os.Getenv("MONGO_DB_HOST") + ":27017"
	fmt.Println("Connecting to mongodb at" + os.Getenv("MONGO_DB_HOST") + "as " + os.Getenv("MONGO_DB_USERNAME"))

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	ctx, _ = context.WithTimeout(context.Background(), 10*time.Second)
	// Check the connection
	err = client.Ping(ctx, readpref.Primary())
	if err != nil {
		return nil, err
	}
	return client.Database("Market"), nil
}

// GetDBCollection grabs a specific collection ready to query
func GetDBCollection(name string) (*mongo.Collection, error) {
	ctx, _ := context.WithTimeout(context.Background(), 10*time.Second)

	uri := "mongodb://" + os.Getenv("MONGO_DB_USERNAME") + ":" + os.Getenv("MONGO_DB_PASSWORD") + "@" + os.Getenv("MONGO_DB_HOST") + ":27017"
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	ctx, _ = context.WithTimeout(context.Background(), 2*time.Second)
	// Check the connection
	err = client.Ping(ctx, readpref.Primary())
	if err != nil {
		return nil, err
	}
	collection := client.Database("Market").Collection(name)
	return collection, nil
}
