const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const User = require('./models/User.js');
const passport = require('passport');
const cookieSession = require('cookie-session');
const cookieParser = require('cookie-parser');
require('dotenv').config(); 
const User = require('./models/User.js');
const RouteHandlers = require('./RouteHandlers');

// initialize express

const app = express();
const port = process.env.PORT || 8080;

// Passport Configuration

passport.use(new GoogleStrategy({
  clientID: process.env.REACT_APP_GOOGLE_CLIENT_ID,
  clientSecret: process.env.REACT_APP_GOOGLE_CLIENT_SECRET,
  callbackURL: "/auth/google/callback"
},
async (accessToken, refreshToken, profile, done) => {
  console.log(profile);
  let user = await User.findOne({userId: profile.id});
  if(user) done(null, user);
  else {
    user = await User.create({
      userId: profile.id,
      displayName: profile.displayName,
      email: profile.emails[0].value,
      image: profile.photos[0].value,
      stocks: []
    })
    
    done(null, user);
  }
}));

passport.serializeUser((user, done) => {
  console.log(user.userId)
  done(null, user.userId);
});

passport.deserializeUser((id, done) => {
  User.findOne({userId: id}, (err, user) => done(err, user));
});

// MongoDB + Mongoose

mongoose.connect(`mongodb+srv://zomgitshenry:${process.env.REACT_APP_MONGODB_KEY}@cluster0.gy4ko.mongodb.net/stocksurfer?retryWrites=true&w=majority`, { 
    useNewUrlParser: true, 
    useUnifiedTopology: true, 
    useFindAndModify: false 
  });
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log('MongoDB Connected');
});

// Middleware

app.use(
  cookieSession({
    name: "session",
    keys: [process.env.REACT_APP_SESSION_SECRET],
    maxAge: 24 * 60 * 60 * 100
  })
);
app.use(cookieParser());
app.use(passport.initialize());
app.use(passport.session())
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors({
  origin: "https://stock-surfer.netlify.app",
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  credentials: true,
}));
app.use(express.static('public'));

// Passport Routes

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { 
    successRedirect: 'https://stock-surfer.netlify.app',
    failureRedirect: 'https://stock-surfer.netlify.app' 
  }),
  (req, res) => {
    res.redirect('/');
  });

app.get("/auth/logout", (req, res) => {
  req.logout();
  res.redirect('https://stock-surfer.netlify.app');
});

// API Routes

// Fetch user profile on user sign-in
app.get('/sync', (req, res) => {
  if(!req.user) { 
    res.send({}); 
    return null 
  };

  User.findOne({userId: req.user.userId})
  .then(user => { res.send(user) });
})

// Update database when user adds/removes stocks from collecton
app.post('/set', (req, res) => {
  User.findOneAndUpdate(
    { userId: req.user.userId },
    { $set: { stocks: req.body.stocks } }
  ).then(console.log)
})

// Query Finviz, then return a list of stocks matching constraints
app.get('/search/:initialValue/:queryOptions?', async (req, res) => {
  const { queryOptions, initialValue } = req.params;
  const returnedCompanies = await RouteHandlers.searchByCriteria(initialValue, queryOptions)
  res.send(JSON.stringify(returnedCompanies));
})

// Fetch data from FinancialModelingPrep for a list of companies 
app.get('/companies/:tickers', async (req, res) => {
  const { tickers } = req.params;
  const stockData = await RouteHandlers.getCompanyData(tickers);
  res.send(JSON.stringify({ stockData }));
})

app.get('/quote/:ticker', async(req, res) => {
  const { ticker } = req.params;
  const quoteData = await RouteHandlers.getQuote(ticker);
  res.send(JSON.stringify({ quoteData }));
})

// Fetch news articles for a company by ticker
app.get('/companynews/:ticker', async (req, res) => {
  const returnData = await RouteHandlers.getCompanyNews(req.params.ticker);
  res.send(returnData);
})

app.listen(port, () => {
  console.log(`listening on port ${port}`)
})