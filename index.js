const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(process.env.DB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();

    // Finance Collection Setup
    const financeCollection = client.db("financeDB").collection("finances");

    // Add Finance
    app.post("/finance", async (req, res) => {
      const finance = req.body;
      const result = await financeCollection.insertOne(finance);
      res.send(result);
    });

    // Get All Finances
    app.get("/finance", async (req, res) => {
      const result = await financeCollection.find().toArray();
      res.send(result);
    });

    // Get Single Finance by ID
    app.get("/finance/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await financeCollection.findOne(query);
      res.send(result);
    });

    // Delete Finance
    app.delete("/finance/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await financeCollection.deleteOne(query);
      res.send(result);
    });

    // Edit Finance (Update Finance)
    app.patch("/finance/:id", async (req, res) => {
      const data = req.body;
      const financeId = req.params.id;
      const filter = { _id: new ObjectId(financeId) };
      const updatedDoc = {
        $set: {
          title: data?.title,
          amount: data?.amount,
          description: data?.description,
          date: data?.date,
          category: data?.category,
          type: data?.type,
        },
      };
      const result = await financeCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    app.get("/finance-stats", async (req, res) => {
      try {
        const financeStats = await financeCollection
          .aggregate([
            {
              $facet: {
                // Total expense, income, and transaction count
                totalStats: [
                  {
                    $group: {
                      _id: null,
                      totalExpense: {
                        $sum: {
                          $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
                        },
                      },
                      totalIncome: {
                        $sum: {
                          $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
                        },
                      },
                      totalTransactions: { $sum: 1 }, // Total transaction count
                    },
                  },
                ],
                // Category-wise expense and income
                categoryStats: [
                  {
                    $group: {
                      _id: "$category",
                      totalExpense: {
                        $sum: {
                          $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
                        },
                      },
                      totalIncome: {
                        $sum: {
                          $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
                        },
                      },
                    },
                  },
                ],
                // Monthly expense and income
                monthlyStats: [
                  {
                    $addFields: {
                      // Convert YYYY-MM-DD to a date object
                      parsedDate: {
                        $dateFromString: {
                          dateString: "$date",
                          format: "%Y-%m-%d", // Adjusted to match the date format in your database
                        },
                      },
                    },
                  },
                  {
                    $group: {
                      _id: {
                        year: { $year: "$parsedDate" }, // Extract year
                        month: { $month: "$parsedDate" }, // Extract month
                      },
                      totalExpense: {
                        $sum: {
                          $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
                        },
                      },
                      totalIncome: {
                        $sum: {
                          $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
                        },
                      },
                    },
                  },
                  {
                    $sort: { "_id.year": 1, "_id.month": 1 }, // Sort by year and month
                  },
                ],
              },
            },
          ])
          .toArray();

        // Format the response
        const response = {
          totalExpense: financeStats[0].totalStats[0].totalExpense,
          totalIncome: financeStats[0].totalStats[0].totalIncome,
          totalTransactions: financeStats[0].totalStats[0].totalTransactions,
          categoryStats: financeStats[0].categoryStats,
          monthlyStats: financeStats[0].monthlyStats,
        };

        res.send(response);
      } catch (error) {
        console.error("Error fetching finance stats:", error);
        res.status(500).send({ error: "Error fetching finance stats" });
      }
    });

    app.get("/category-stats", async (req, res) => {
      try {
        // Aggregating expense categories
        const expenseStats = await financeCollection
          .aggregate([
            {
              $match: { type: "expense" }, // Filter for expense type
            },
            {
              $group: {
                _id: "$category", // Group by category
                categoryCount: { $sum: 1 }, // Count the number of transactions per category
                totalAmount: { $sum: "$amount" }, // Sum the amount per category
              },
            },
            {
              $sort: { totalAmount: -1 }, // Sort by totalAmount (highest first)
            },
          ])
          .toArray();

        // Aggregating income categories
        const incomeStats = await financeCollection
          .aggregate([
            {
              $match: { type: "income" }, // Filter for income type
            },
            {
              $group: {
                _id: "$category", // Group by category
                categoryCount: { $sum: 1 }, // Count the number of transactions per category
                totalAmount: { $sum: "$amount" }, // Sum the amount per category
              },
            },
            {
              $sort: { totalAmount: -1 }, // Sort by totalAmount (highest first)
            },
          ])
          .toArray();

        // Sending both expense and income stats as a combined response
        res.send({
          expenseStats,
          incomeStats,
        });
      } catch (error) {
        console.error("Error fetching category stats:", error);
        res.status(500).send({ error: "Error fetching category stats" });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send(`running`);
});

app.listen(port, (req, res) => {
  console.log(`on port: ${port}`);
});
