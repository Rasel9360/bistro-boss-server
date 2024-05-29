const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
require('dotenv').config()
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000;


// middleware

app.use(cors(
    {
        origin: [
            'http://localhost:5173',
            'http://localhost:5174',
            'https://bistro-boss-22ae2.web.app',
            'https://bistro-boss-22ae2.firebaseapp.com'
        ],
        credentials: true,
    }
));
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.bhgag9l.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });

        const menuCollection = client.db('bistroDB').collection('menu');
        const usersCollection = client.db('bistroDB').collection('users');
        const reviewsCollection = client.db('bistroDB').collection('reviews');
        const cartsCollection = client.db('bistroDB').collection('carts');
        const paymentsCollection = client.db('bistroDB').collection('payments');


        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_SECRET_TOKEN, { expiresIn: '1h' });
            res.send({ token })
        })

        // middleware

        const verifyToken = (req, res, next) => {
            // console.log("inside verify token ", req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_SECRET_TOKEN, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
            // next()
        }

        // verifyAdmin
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === "admin";
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next()
        }


        // user related api

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {

            const result = await usersCollection.find().toArray();
            res.send(result);
        })

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            let isAdmin = false;
            if (user) {
                isAdmin = user?.role === 'admin';
            }
            res.send({ isAdmin })
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            // check user already exist
            const query = { email: user?.email };
            const isExist = await usersCollection.findOne(query);
            if (isExist) {
                return res.send({ message: "user is already exist", insertedId: null })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        app.delete('/users/:id', verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })

        app.patch('/users/admin/:id', verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(query, updatedDoc);
            res.send(result);
        })

        // menu related api
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().sort({ '_id': -1 }).toArray();
            res.send(result)
        })

        app.get('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.findOne(query);
            res.send(result)
        })

        app.put('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const menu = req.body;
            const query = { _id: new ObjectId(id) };
            const options = { upsert: true };
            const updatedDoc = {
                $set: {
                    ...menu
                }
            }
            const result = await menuCollection.updateOne(query, updatedDoc, options);
            res.send(result);
        })

        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const menu = req.body;
            const result = await menuCollection.insertOne(menu);
            res.send(result);
        })

        app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id
            console.log(id);
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.deleteOne(query);
            res.send(result)
        })

        // reviews related api
        app.get('/reviews', async (req, res) => {
            const result = await reviewsCollection.find().toArray();
            res.send(result)
        })

        // cart related api

        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await cartsCollection.find(query).toArray();
            res.send(result)
        })

        app.post('/carts', async (req, res) => {
            const carts = req.body;
            const result = await cartsCollection.insertOne(carts);
            res.send(result)
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartsCollection.deleteOne(query);
            res.send(result)
        });

        // Payment intent related api
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const totalPrice = parseInt(price * 100);
            // console.log(totalPrice);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: totalPrice,
                currency: "usd",
                "payment_method_types": [
                    "card"
                ],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        })

        app.get('/payments/:email', verifyToken, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: "forbidden access" })
            }
            const result = await paymentsCollection.find(query).sort({ '_id': -1 }).toArray();
            res.send(result)
        })

        app.post('/payments', async (req, res) => {
            const payment = req.body;
            console.log(payment);
            const query = {
                _id: {
                    $in: payment.cartIds.map(id => new ObjectId(id))
                }
            }

            const deleteResult = await cartsCollection.deleteMany(query);

            const paymentResult = await paymentsCollection.insertOne(payment)
            res.send({ paymentResult, deleteResult })

        })

        // payments stats 
        app.get('/payment-stats', async (req, res) => {
            const customers = await usersCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentsCollection.estimatedDocumentCount();

            const result = await paymentsCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: { $sum: '$price' }
                    }
                }
            ]).toArray()
            const totalRevenue = result.length > 0 ? result[0].totalRevenue : 0;
            res.send({
                customers,
                menuItems,
                orders,
                totalRevenue
            })
        })

        // using aggregate pipeline
        app.get('/order-stats', async (req, res) => {
            const result = await paymentsCollection.aggregate([

                {
                    $addFields: {
                        menuItemsObjectIds: {
                            $map: {
                                input: '$menuIds',
                                as: 'itemId',
                                in: { $toObjectId: '$$itemId' }
                            }
                        }
                    }
                },
                {
                    $lookup: {
                        from: 'menu',
                        localField: 'menuItemsObjectIds',
                        foreignField: '_id',
                        as: 'menuItemsData'
                    }
                },
                {
                    $unwind: '$menuItemsData'
                },
                {
                    $group: {
                        _id: '$menuItemsData.category',
                        quantity: { $sum: 1 },
                        revenue: { $sum: '$menuItemsData.price' }
                    }
                },
                {
                    $project: {
                        _id: 0,
                        category: '$_id',
                        quantity: '$quantity',
                        revenue: '$revenue'
                    }
                }

            ]).toArray();
            res.send(result)
        })

        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Bistro boss is running')
})

app.listen(port, () => {
    console.log(`Bistro boss is running on port ${port}`);
})