import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { User, Tenant, Plan } from '../../database/entities';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User, Tenant, Plan])],
  controllers: [TeamController],
  providers: [TeamService, DashboardAddonGuard],
  exports: [TeamService],
})
export class TeamModule {}
