import { Injectable } from '@nestjs/common';
import { type Order, type Payment, type Prisma } from '../../generated/prisma/client';

/**
 * Payment records (PAYMENT_RULES, DATABASE.md §28–29). Payment state is separate from order state
 * and only changes through verified provider results or the COD collection event.
 */
@Injectable()
export class PaymentsService {
  /**
   * The order's payment record, created in the order-creation transaction (PAYMENT_RULES §9).
   * COD stays PENDING until collection on delivery (ADR-0014 §10); online payments stay PENDING
   * until the provider confirms them.
   */
  createForOrder(
    tx: Prisma.TransactionClient,
    order: Order,
    idempotencyKey: string | null,
  ): Promise<Payment> {
    return tx.payment.create({
      data: {
        orderId: order.id,
        customerId: order.customerId,
        method: order.paymentMethod,
        status: 'PENDING',
        amount: order.totalAmount,
        currency: order.currency,
        idempotencyKey,
      },
    });
  }
}
