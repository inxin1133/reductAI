import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import tenantRoutes from './routes/tenantRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

app.use('/api/tenants', tenantRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'tenant-service' });
});

app.listen(PORT, () => {
  console.log(`Tenant Service running on port ${PORT}`);
});

