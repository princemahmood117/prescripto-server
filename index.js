const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const nodemailer = require("nodemailer");

const port = process.env.PORT || 5000

// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174', 'https://nimble-marzipan-80622c.netlify.app','https://firebase.google.com','https://console.firebase.google.com/u/0/project/stayvista-ef3a5/overview', 'https://console.firebase.google.com/u/0/project/stayvista-ef3a5/authentication/users','https://prescripto-f40d1.web.app','https://prescripto-f40d1.firebaseapp.com','https://imgbb.com','https://api.imgbb.com','https://prince-mahmood.imgbb.com','https://www.nodemailer.com','https://stripe.com','https://console.firebase.google.com/u/0/project/prescripto-f40d1/authentication/users','https://console.firebase.google.com/u/0/project/prescripto-f40d1/overview','https://dainty-queijadas-72163c.netlify.app'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())


// send email
const sendEmail = (emailAddress, emailData) => {

  const transporter = nodemailer.createTransport({
    service:'gmail',
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for port 465, false for other ports
    auth: {
      user: process.env.TRANSPORTER_EMAIL,
      pass: process.env.TRANSPORTER_PASS,
    },
  });

  // verify tranporter

  transporter.verify(function (error, success) {
    if (error) {
      console.log(error);
    } else {
      console.log("Server is ready to take our messages");
    }
  });

  const mailBody = {
    from: `"Prescripto" <${ process.env.TRANSPORTER_EMAIL}>`, // sender address
    to: emailAddress, // list of receivers
    subject: emailData.subject, // Subject line
    html: emailData.message, // html body
  }

    transporter.sendMail(mailBody, (error,info) =>{
    if(error) {
      console.log(error);
    }
    else {
      console.log('Email sent : ' + info.response );
    }
   });

 

}

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  console.log(token)
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next()
  })
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ddujh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

const cookieOption = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' ? true : false,
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
}

async function run() {
  try {

    const roomsCollection = client.db('prescripto').collection('rooms')
    const usersCollection = client.db('prescripto').collection('users')
    const bookingsCollection = client.db('prescripto').collection('bookings')

     // verify admin middleware

     const verifyAdmin = async(req,res,next) => {
      const user = req.user;
      const query = {email: user?.email};

      const result = await usersCollection.findOne(query)

      if(!result || result?.role !== 'admin') 
        return res.status(401).send({message:"unauthorized access"})

      next()
      
    }


     const verifyHost = async(req,res,next) => {
      const user = req.user;
      const query = {email: user?.email};

      const result = await usersCollection.findOne(query)

      if(!result || result?.role !== 'host') 
        return res.status(401).send({message:"unauthorized access"})

      next()
      
    }

    // ----------------- ROOMS related ---------------

    // get all rooms from database

    app.get('/rooms', async(req,res) => {

      const category = req.query.category
      let query = {}

      if(category && category !== 'null') {
        query = {category : category}
      }
      const result = await roomsCollection.find(query).toArray()
      res.send(result)
    })

    // get single room data from database

    app.get('/room/:id', async(req,res) => {
      const id = req.params.id;
      const query = {_id:new ObjectId(id)}
      const result = await roomsCollection.findOne(query)
      res.send(result)
    })

    // add room into database

    app.post('/room',verifyToken, verifyHost, async(req,res) => {
      const roomData = req.body;
      const result = await roomsCollection.insertOne(roomData)
      res.send(result)
    })


    // get all rooms for host (my-listings)

    app.get('/my-listings/:email',verifyToken, verifyHost, async(req,res) => {

      const email = req.params.email
      let query = {'host.email' : email}

      const result = await roomsCollection.find(query).toArray()
      res.send(result)
    })



    // Delete room from My Listings

    app.delete('/room/:id',verifyToken, verifyHost, async(req, res) => {
      const id = req.params.id;
      const query = {_id : new ObjectId(id)}
      result = await roomsCollection.deleteOne(query);
      res.send(result)
    })



// ----------------- USER related ---------------


    // save user data in databse

    app.put('/user', async (req,res) => {
      const user = req.body;
      const query = {email : user?.email}

      // check if user already exists in the database

      const isExist = await usersCollection.findOne(query)

      if(isExist) {
        if(user.status === 'Requested') {
          const result = await usersCollection.updateOne(query, {
            $set : {
              status : user?.status
            }
          })

          return res.send(result)
        }

        else {
          return res.send(isExist)
        }
        
      }

      const options = {upsert : true}

      const updateDoc = {
        $set: {
          ...user,
          timestamp : Date.now(),
        }
      }
      const result = await usersCollection.updateOne(query, updateDoc, options)
        // welcome new user
        sendEmail( user?.email, {
          subject : "Welcome to Stay Vista",
          message : "Hope you find your desired room"
        })
      res.send(result)
    })


     // get all user data from databse
     
     app.get('/users',verifyToken, verifyAdmin ,async(req,res) => {
      const result = await usersCollection.find().toArray();
      res.send(result)
     })


    //  update user role

     app.patch('/users/update/:email', async(req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = {email}
      const updateDoc = {
        $set : {
          ...user, 
          timestamp : Date.now()
        }
      }

      const result = await usersCollection.updateOne(query, updateDoc)
      res.send(result)
     })


    //  get a user info by email from database

    app.get('/user/:email', async(req,res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({email})
      res.send(result)
    })


   // ----------------- PAYMENT related ---------------

    app.post('/create-payment-intent', verifyToken, async(req,res) => {
      const price = req.body.price;
      const priceInCent = parseFloat(price) * 100;

      if(!price || priceInCent < 1) {
        return
      }

      // generate client secret
      const {client_secret} = await stripe.paymentIntents.create({
        amount: priceInCent ,
        currency : 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
      })

      // send client secret as response

      res.send({clientSecret : client_secret })
    })



  // ----------------- BOOKING related ---------------


    // save room booking info
    app.post('/booking',verifyToken, async(req,res) => {
      const bookingData = req.body;
  
      const result = await bookingsCollection.insertOne(bookingData)

      // send email to guest
      sendEmail(bookingData?.guest?.email, {
        subject : "Booking Successful",
        message : `Congratulations for the booking.Thank you for staying with stayvista. Transaction id : ${bookingData.transactionId}`
      })
       // send email to host
      sendEmail(bookingData?.host?.email, {
        subject : "Room got booked",
        message : `Your room got booked by ${bookingData?.guest.name}`
      })

      res.send(result)
    })

    // update room status --> change room availablity status

    app.patch('/room/status/:id', async(req,res) => {
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}

      const status = req.body.status;
      const updateDoc = {
        $set: {
          booked: status,
        }
      }
      const result = await roomsCollection.updateOne(query, updateDoc )
      res.send(result)

    })

    // get all bookings for a guest

    app.get('/my-bookings/:email', verifyToken, async(req,res) =>{
      const email = req.params.email;
      const query = {'guest.email' : email};

      const result = await bookingsCollection.find(query).toArray()
      res.send(result)
    })


    // get all bookings for the host

    app.get('/manage-bookings/:email', verifyToken, verifyHost, async(req,res) =>{
      const email = req.params.email;
      const query = {'host.email' : email};

      const result = await bookingsCollection.find(query).toArray()
      res.send(result)
    })


    // Delete a booking

    app.delete('/booking/:id',verifyToken, async(req, res) => {
      const id = req.params.id;
      const query = {_id : new ObjectId(id)}
      result = await bookingsCollection.deleteOne(query);
      res.send(result)
    })


    // admin statistics

    app.get('/admin-stat', verifyToken, verifyAdmin, async(req,res) => {

      const bookingDetails = await bookingsCollection.find({}, {projection : {
        date : 1,
        price : 1,
      }}).toArray()

      const totalPrice = bookingDetails.reduce((sum,booking)=> sum+booking.price ,0)
      const totalUsers = await usersCollection.countDocuments()
      const totalRooms = await roomsCollection.countDocuments()

      const chartData = bookingDetails.map(booking => {
        const day = new Date(booking.date).getDate()
        const month = new Date(booking.date).getMonth() + 1

        const data = [`${day}/${month}`, booking?.price]

        return data;
      })
      chartData.unshift(['Day', 'Sales'])

      res.send({totalUsers,totalRooms, totalBookings:bookingDetails.length, totalPrice, chartData})
    })


       // host statistics

    app.get('/host-stat', verifyToken, verifyHost, async(req,res) => {

      const {email} = req.user;
      const bookingDetails = await bookingsCollection.find({"host.email" : email}, {projection : {
        date : 1,
        price : 1,
      }}).toArray()

      const totalPrice = bookingDetails.reduce((sum,booking)=> sum+booking.price ,0)
  
      const totalRooms = await roomsCollection.countDocuments({"host.email" : email})


      const {timestamp} = await usersCollection.findOne({email}, {projection : {
        timestamp : 1,
      }})

      const chartData = bookingDetails.map(booking => {
        const day = new Date(booking.date).getDate()
        const month = new Date(booking.date).getMonth() + 1

        const data = [`${day}/${month}`, booking?.price]

        return data;
      })
      chartData.unshift(['Day', 'Sales'])

      res.send({hostSince:timestamp, totalRooms, totalBookings:bookingDetails.length, totalPrice, chartData})
    })



        // guest statistics

        app.get('/guest-stat', verifyToken, async(req,res) => {

            const {email} = req.user;
            const bookingDetails = await bookingsCollection.find({"guest.email" : email}, {projection : {
              date : 1,
              price : 1,
            }}).toArray()
      
            const totalPrice = bookingDetails.reduce((sum,booking)=> sum+booking.price ,0)
      
            const {timestamp} = await usersCollection.findOne({email}, {projection : {
              timestamp : 1,
            }})
      
            const chartData = bookingDetails.map(booking => {
              const day = new Date(booking.date).getDate()
              const month = new Date(booking.date).getMonth() + 1
      
              const data = [`${day}/${month}`, booking?.price]
      
              return data;
            })
            chartData.unshift(['Day', 'Sales'])
      
            res.send({guestSince:timestamp, totalBookings:bookingDetails.length, totalPrice, chartData})
          })


          // update room details

          app.put('/room/update/:id', verifyToken, verifyHost, async(req,res) => {
            const id = req.params.id;
            const query = {_id : new ObjectId(id)}
            const roomData = req.body;
            const updateDoc = {
              $set : roomData
            }
            const result = await roomsCollection.updateOne(query, updateDoc)
            res.send(result)
          })



    // auth related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      })
      res
        .cookie('token', token, cookieOption )
        .send({ success: true })
    })

    
    // // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            ...cookieOption,
            maxAge: 0,    
          })
          .send({ success: true })
        // console.log('Logout successful')
      } catch (err) {
        res.status(500).send(err)
      }
    })




    
    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Prescripto running')
})

app.listen(port, () => {
  console.log(`Prescripto is running on port ${port}`)
})
