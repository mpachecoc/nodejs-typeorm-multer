import { getRepository, getCustomRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import path from 'path';
import fs from 'fs';

import Transaction from '../models/Transaction';
import TransactionsRepository from '../repositories/TransactionsRepository';
import Category from '../models/Category';
import uploadConfig from '../config/upload';
// import AppError from '../errors/AppError';

interface Request {
  csvFilename: string;
}

interface ParsedTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute({ csvFilename }: Request): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionsRepository);
    const categoriesRepository = getRepository(Category);

    // Read & Parse CSV File
    const csvFilePath = path.resolve(uploadConfig.directory, csvFilename);

    const readCsvStream = fs.createReadStream(csvFilePath);

    const parseStream = csvParse({
      from_line: 2,
      ltrim: true,
      rtrim: true,
    });

    const parsedCSV = readCsvStream.pipe(parseStream);

    const categories: string[] = [];
    const transactions: ParsedTransaction[] = [];

    parsedCSV.on('data', line => {
      const [title, type, value, category] = line.map((item: string) => item);

      categories.push(category);
      transactions.push({
        title,
        type,
        value,
        category,
      });
    });

    await new Promise(resolve => {
      parsedCSV.on('end', resolve);
    });

    // Insert "Categories" into DB
    const existingCategoriesBD = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const existingCategories = existingCategoriesBD.map(
      category => category.title,
    );

    const nonExistingCategories = categories.filter(
      category => !existingCategories.includes(category),
    );

    const uniqueNonExistingCategories = nonExistingCategories.reduce(
      (accumulator: string[], category: string) => {
        if (accumulator.indexOf(category) < 0) {
          accumulator.push(category);
        }
        return accumulator;
      },
      [],
    );

    const newCategories = categoriesRepository.create(
      uniqueNonExistingCategories.map(title => ({
        title,
      })),
    );

    await categoriesRepository.save(newCategories);

    const allCategories = [...existingCategoriesBD, ...newCategories];

    // Insert "Transactions" into DB
    const newTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: allCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(newTransactions);

    await fs.promises.unlink(csvFilePath);

    return newTransactions;
  }
}

export default ImportTransactionsService;
