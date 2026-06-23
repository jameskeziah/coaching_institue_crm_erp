const { env } = require('./config/env');
const express = require('express');
const cors = require('cors');
const { migrate } = require('./db');

const authRoutes = require('./routes/auth.routes');
const usersRoutes = require('./routes/users.routes');
const admissionsRoutes = require('./routes/admissions.routes');
const studentsRoutes = require('./routes/students.routes');
const legacyRoutes = require('./routes/legacy.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ProTrack Institute OS API',
    environment: env.NODE_ENV,
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admissions', admissionsRoutes);
app.use('/api/students', studentsRoutes);

// Remaining routes are migrated module by module while preserving frontend URLs.
app.use(legacyRoutes);

(async () => {
  await migrate();
  app.listen(env.PORT, () => {
    console.log(`Server listening on http://localhost:${env.PORT}`);
  });
})();
