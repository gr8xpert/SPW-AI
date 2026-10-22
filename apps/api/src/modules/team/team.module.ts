import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { User, Tenant, Plan } from '../../database/entities';
import { DashboardAddonGuard } from '../../common/guards/dashboard-addon.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User, Tenant, Plan])],
  controllers: [TeamController, AgentsController],
  providers: [TeamService, AgentsService, DashboardAddonGuard],
  exports: [TeamService, AgentsService],
})
export class TeamModule {}
