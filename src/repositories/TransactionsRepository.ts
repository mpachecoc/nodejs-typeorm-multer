import { EntityRepository, Repository } from 'typeorm';

import Transaction from '../models/Transaction';

interface Balance {
  income: number;
  outcome: number;
  total: number;
}

@EntityRepository(Transaction)
class TransactionsRepository extends Repository<Transaction> {
  public async getBalance(): Promise<Balance> {
    const transactions = await this.find();

    const { income, outcome } = transactions.reduce(
      (sum, transaction) => {
        switch (transaction.type) {
          case 'income':
            sum.income += transaction.value;
            break;

          case 'outcome':
            sum.outcome += transaction.value;
            break;

          default:
            break;
        }

        return sum;
      },
      {
        income: 0,
        outcome: 0,
      },
    );

    const total = income - outcome;

    const balance = {
      income,
      outcome,
      total,
    };

    return balance;
  }
}

export default TransactionsRepository;
