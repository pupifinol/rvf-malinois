import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';

/**
 * Zod-based validation pipe.
 *
 * The codebase already standardises on Zod (packages/types and the realtime
 * layer); pulling class-validator just for backend DTOs would have introduced
 * a second schema dialect. The pipe is small on purpose — usage:
 *
 *   ⁠@Query(new ZodValidationPipe(JobQuerySchema)) query: JobQuery
 *
 * Failures surface as 400 with the Zod issue list, useful in dev + future
 * automated client generation.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'Validation failed',
          errors: err.errors,
        });
      }
      throw err;
    }
  }
}
