import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtPayload } from '@spm/shared';
import { DashboardAddonGuard, JwtAuthGuard, RolesGuard, TenantGuard } from '../../../common/guards';
import { CurrentTenant, CurrentUser, RequiresAddon, Roles } from '../../../common/decorators';
import { BuyerService } from './buyer.service';
import { BuyerStageService } from './buyer-stage.service';
import { BuyerQuestionService } from './buyer-question.service';
import { BuyerTaskService } from './buyer-task.service';
import { BuyerFileService } from './buyer-file.service';
import { viewerOf } from './buyer.controller';
import { ListBuyersDto } from './dto/buyer.dto';
import {
  CreateQuestionDto,
  CreateStageDto,
  CreateTaskDto,
  DueTasksDto,
  ReorderDto,
  SetAnswersDto,
  UpdateQuestionDto,
  UpdateStageDto,
  UpdateTaskDto,
} from './dto/buyer-follow-up.dto';

const MAX_BUYER_FILE_MB = 20;

// Board, stage and question editors, tasks, files and answers. Registered
// before BuyerController so 'board', 'tasks', 'stages'… never reach /:id.
@Controller('api/dashboard/buyers')
@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard, RolesGuard)
@RequiresAddon('buyerMatch')
export class BuyerFollowUpController {
  constructor(
    private readonly buyers: BuyerService,
    private readonly stages: BuyerStageService,
    private readonly questions: BuyerQuestionService,
    private readonly tasks: BuyerTaskService,
    private readonly files: BuyerFileService,
  ) {}

  @Get('board')
  board(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query() dto: ListBuyersDto) {
    return this.buyers.board(tenantId, viewerOf(user), dto);
  }

  // ── Stages (owners and managers) ──────────────────────────────────────

  @Post('stages')
  @Roles('admin')
  createStage(@CurrentTenant() tenantId: number, @Body() dto: CreateStageDto) {
    return this.stages.create(tenantId, dto);
  }

  @Put('stages/order')
  @Roles('admin')
  reorderStages(@CurrentTenant() tenantId: number, @Body() dto: ReorderDto) {
    return this.stages.reorder(tenantId, dto.ids);
  }

  @Put('stages/:stageId')
  @Roles('admin')
  updateStage(@CurrentTenant() tenantId: number, @Param('stageId', ParseIntPipe) id: number, @Body() dto: UpdateStageDto) {
    return this.stages.update(tenantId, id, dto);
  }

  @Delete('stages/:stageId')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeStage(
    @CurrentTenant() tenantId: number,
    @Param('stageId', ParseIntPipe) id: number,
    @Query('moveTo') moveTo?: string,
  ) {
    const target = moveTo ? Number(moveTo) : undefined;
    if (moveTo && !Number.isInteger(target)) throw new BadRequestException('moveTo must be a stage id');
    return this.stages.remove(tenantId, id, target);
  }

  // ── Buyer questions ───────────────────────────────────────────────────

  @Get('questions')
  listQuestions(@CurrentTenant() tenantId: number) {
    return this.questions.list(tenantId);
  }

  @Post('questions')
  @Roles('admin')
  createQuestion(@CurrentTenant() tenantId: number, @Body() dto: CreateQuestionDto) {
    return this.questions.create(tenantId, dto);
  }

  @Put('questions/order')
  @Roles('admin')
  reorderQuestions(@CurrentTenant() tenantId: number, @Body() dto: ReorderDto) {
    return this.questions.reorder(tenantId, dto.ids);
  }

  @Put('questions/:questionId')
  @Roles('admin')
  updateQuestion(
    @CurrentTenant() tenantId: number,
    @Param('questionId', ParseIntPipe) id: number,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questions.update(tenantId, id, dto);
  }

  @Delete('questions/:questionId')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeQuestion(@CurrentTenant() tenantId: number, @Param('questionId', ParseIntPipe) id: number) {
    return this.questions.remove(tenantId, id);
  }

  // ── Tasks ─────────────────────────────────────────────────────────────

  @Get('tasks/due')
  dueTasks(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Query() dto: DueTasksDto) {
    return this.tasks.due(tenantId, viewerOf(user), dto);
  }

  @Put('tasks/:taskId')
  updateTask(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('taskId', ParseIntPipe) taskId: number,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(tenantId, viewerOf(user), taskId, dto);
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeTask(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('taskId', ParseIntPipe) taskId: number) {
    return this.tasks.remove(tenantId, viewerOf(user), taskId);
  }

  @Get(':id/tasks')
  listTasks(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.tasks.listForBuyer(tenantId, viewerOf(user), id);
  }

  @Post(':id/tasks')
  createTask(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(tenantId, viewerOf(user), id, dto);
  }

  // ── Files ─────────────────────────────────────────────────────────────

  @Delete('files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeFile(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('fileId', ParseIntPipe) fileId: number) {
    return this.files.remove(tenantId, viewerOf(user), fileId);
  }

  @Get(':id/files')
  listFiles(@CurrentTenant() tenantId: number, @CurrentUser() user: JwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.files.list(tenantId, viewerOf(user), id);
  }

  @Post(':id/files')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BUYER_FILE_MB * 1024 * 1024, files: 1 } }))
  uploadFile(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.files.upload(tenantId, viewerOf(user), id, {
      fieldname: file.fieldname,
      originalname: file.originalname,
      encoding: file.encoding,
      mimetype: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    });
  }

  // ── Buyer questions answers ───────────────────────────────────────────

  @Put(':id/answers')
  setAnswers(
    @CurrentTenant() tenantId: number,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetAnswersDto,
  ) {
    return this.buyers.setAnswers(tenantId, viewerOf(user), id, dto.answers);
  }
}
