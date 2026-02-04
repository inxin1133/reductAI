import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fileRoutes from './routes/fileRoutes';
import mediaRoutes from './routes/mediaRoutes';
import { startFileAssetCleanup } from './services/ttlCleanupService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3008;

app.use(cors());
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));

app.use('/api/files', fileRoutes);
app.use('/api/ai/media', mediaRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'file-service' });
});

app.listen(PORT, () => {
  console.log(`File Service running on port ${PORT}`);
  startFileAssetCleanup();
});
