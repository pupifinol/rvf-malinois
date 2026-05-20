import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { CanonicalTag } from '@prisma/client';

/**
 * CanonicalTagsService — the RVF-governed dictionary.
 *
 * Global, NOT tenant-scoped (domain-model §10, ADR-003/004). The meaning of
 * an existing tag is fixed forever; new tags can be added with care.
 *
 * F1: read-only access from REST + internal lookups by name.
 * F1.5+: a guarded `rename`/`deprecate` path that refuses if the tag is
 *        referenced in any sensor or snapshot row (defense in depth on top
 *        of the "name is the business key, never change meaning" rule).
 */
@Injectable()
export class CanonicalTagsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<CanonicalTag[]> {
    return this.prisma.canonicalTag.findMany({ orderBy: { name: 'asc' } });
  }

  async findByName(name: string): Promise<CanonicalTag> {
    const tag = await this.prisma.canonicalTag.findUnique({ where: { name } });
    if (!tag) {
      throw new NotFoundException(`Canonical tag '${name}' not found.`);
    }
    return tag;
  }
}
