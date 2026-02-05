import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes';
import roleRoutes from './routes/roleRoutes';
import permissionRoutes from './routes/permissionRoutes';
import { requireAuth } from './middleware/requireAuth';
import { requirePlatformAdmin } from './middleware/requirePlatformRole';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

app.use('/api/users', requireAuth, requirePlatformAdmin, userRoutes);
app.use('/api/roles', requireAuth, requirePlatformAdmin, roleRoutes);
app.use('/api/permissions', requireAuth, requirePlatformAdmin, permissionRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-service' });
});

app.listen(PORT, () => {
  console.log(`User Service running on port ${PORT}`);
});
