import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import tenantRoutes from './routes/tenantRoutes';
import { requireAuth } from './middleware/requireAuth';
import { requirePlatformAdmin } from './middleware/requirePlatformRole';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

app.use('/api/tenants', requireAuth, requirePlatformAdmin, tenantRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tenant-service' });
});

app.listen(PORT, () => {
  console.log(`Tenant Service running on port ${PORT}`);
});

