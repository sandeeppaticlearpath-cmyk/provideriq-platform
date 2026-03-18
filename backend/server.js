const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const providerRoutes = require('./routes/providers');
const bobRoutes = require('./routes/bob');

const app = express();
const providersRoute = require('./routes/providers');

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);
app.use('/api/bob', bobRoutes);

app.get('/', (req, res) => {
  res.send("ProviderIQ API running");
});

app.listen(5000, () => console.log("Server running"));
