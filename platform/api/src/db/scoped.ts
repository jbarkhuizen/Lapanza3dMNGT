import { prisma } from './client.js';

export interface CreateCustomerInput {
  name: string;
  billingAddress: string;
  company?: string;
  email?: string;
  phone?: string;
  deliveryAddress?: string;
  vatNumber?: string;
  notes?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  company?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  deliveryAddress?: string;
  vatNumber?: string;
  notes?: string;
}

export function tenantScope(tenantId: string) {
  if (!tenantId) {
    throw new Error('tenantScope requires a tenantId');
  }
  return {
    customers: {
      findMany: () => prisma.customer.findMany({ where: { tenantId } }),

      findById: (id: string) => prisma.customer.findFirst({ where: { id, tenantId } }),

      create: (data: CreateCustomerInput) =>
        prisma.customer.create({ data: { ...data, tenantId } }),

      update: (id: string, data: UpdateCustomerInput) =>
        prisma.customer.updateMany({ where: { id, tenantId }, data: { ...data, tenantId: undefined } }),
    },
  };
}
