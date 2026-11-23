import type { OnModuleDestroy } from '@nestjs/common';
import { Global, Inject, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async onModuleDestroy() {
    await this.db.$disconnect();
  }
}
