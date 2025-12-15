import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import healthRoutes from '../../src/routes/health.js';

describe('Health routes', () => {
  const app = express();
  app.use('/', healthRoutes);

  describe('GET /health', () => {
    it('should return status ok', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });

    it('should include timestamp', async () => {
      const response = await request(app).get('/health');

      expect(response.body.timestamp).toBeDefined();
      expect(new Date(response.body.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should include version', async () => {
      const response = await request(app).get('/health');

      expect(response.body.version).toBe('1.0.0');
    });
  });

  describe('GET /info', () => {
    it('should return server info', async () => {
      const response = await request(app).get('/info');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Ganymede API');
      expect(response.body.version).toBe('1.0.0');
    });

    it('should include pricing info', async () => {
      const response = await request(app).get('/info');

      expect(response.body.pricing).toBeDefined();
      expect(response.body.pricing['POST /v1/swap/enhanced']).toBe('$0.005 per request');
    });

    it('should include feature descriptions', async () => {
      const response = await request(app).get('/info');

      expect(response.body.features).toBeDefined();
      expect(response.body.features.mevProtection).toBeDefined();
      expect(response.body.features.priorityFees).toBeDefined();
      expect(response.body.features.analytics).toBeDefined();
    });
  });
});
