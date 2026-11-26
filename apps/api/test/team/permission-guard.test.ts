import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSION_KEY } from '../../src/auth/decorators/require-permission.decorator';
import { PermissionGuard } from '../../src/auth/guards/permission.guard';
import type { SessionUser } from '../../src/auth/auth.service';

function makeContext(user?: Partial<SessionUser>): ExecutionContext {
  const request = { user };
  const handler = () => undefined;
  class DummyController {}
  return {
    getHandler: () => handler,
    getClass: () => DummyController,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard RBAC enforcement', () => {
  it('allows requests when no permission metadata is declared', () => {
    const getAllAndOverride = vi.fn(() => undefined);
    const reflector = { getAllAndOverride } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);
    const ctx = makeContext();

    expect(guard.canActivate(ctx)).toBe(true);
    expect(getAllAndOverride).toHaveBeenCalledWith(PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
  });

  it('throws ForbiddenException when user is missing on a protected route', () => {
    const reflector = { getAllAndOverride: vi.fn(() => 'exhibit:write') } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
  });

  it('always allows admin regardless of explicit permissions list', () => {
    const reflector = { getAllAndOverride: vi.fn(() => 'exhibit:validate') } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    expect(guard.canActivate(makeContext({ role: 'admin', permissions: [] }))).toBe(true);
  });

  it('allows non-admin users who hold the required permission', () => {
    const reflector = { getAllAndOverride: vi.fn(() => 'exhibit:write') } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    expect(
      guard.canActivate(makeContext({ role: 'curator', permissions: ['exhibit:read', 'exhibit:write'] })),
    ).toBe(true);
  });

  it('denies non-admin users lacking the required permission or permissions array', () => {
    const reflector = { getAllAndOverride: vi.fn(() => 'exhibit:validate') } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    expect(() =>
      guard.canActivate(makeContext({ role: 'curator', permissions: ['exhibit:read', 'exhibit:write'] })),
    ).toThrow('Missing permission: exhibit:validate');

    expect(() =>
      guard.canActivate(makeContext({ role: 'viewer' })),
    ).toThrow(ForbiddenException);
  });
});
