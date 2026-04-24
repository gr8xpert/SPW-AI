import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiChatEntities1776309900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE chat_conversations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tenantId INT NOT NULL,
        sessionId VARCHAR(64) NOT NULL,
        propertyReference VARCHAR(50) NULL,
        language VARCHAR(10) NULL,
        status ENUM('active','closed') NOT NULL DEFAULT 'active',
        metadata JSON NULL,
        messageCount INT NOT NULL DEFAULT 0,
        adminEmailed TINYINT NOT NULL DEFAULT 0,
        lastMessageAt TIMESTAMP NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT FK_chat_conv_tenant FOREIGN KEY (tenantId) REFERENCES tenants(id) ON DELETE CASCADE,
        INDEX IDX_chat_conv_tenant_session (tenantId, sessionId),
        INDEX IDX_chat_conv_tenant_status (tenantId, status, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE chat_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        conversationId INT NOT NULL,
        role ENUM('system','user','assistant','tool') NOT NULL,
        content TEXT NOT NULL,
        toolName VARCHAR(50) NULL,
        toolCallId VARCHAR(100) NULL,
        tokenCount INT NULL,
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT FK_chat_msg_conv FOREIGN KEY (conversationId) REFERENCES chat_conversations(id) ON DELETE CASCADE,
        INDEX IDX_chat_msg_conv_created (conversationId, createdAt)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS chat_messages');
    await queryRunner.query('DROP TABLE IF EXISTS chat_conversations');
  }
}
