import { Controller, Get } from '@nestjs/common';

/**
 * Health endpoint.
 *
 * Liveness probe for Docker, load balancers, and uptime monitors. Kept
 * intentionally cheap — it must not depend on the database, because then a
 * brief DB blip would mark the whole service as unhealthy and trigger a
 * restart cascade.
 *
 * F1 will add `/health/ready` (readiness) that DOES check DB and Redis.
 */
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: string; timestamp: string } {
    return {
      status: 'ok',
      service: 'rvf-malinois-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
