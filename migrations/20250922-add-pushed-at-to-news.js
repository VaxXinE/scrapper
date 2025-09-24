// migrations/20250922_add-push-columns-to-news.js
'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // ====== Columns ======
      await queryInterface.addColumn(
        'news',
        'push_state',
        {
          type: Sequelize.ENUM('pending', 'sent', 'failed', 'skipped'),
          allowNull: false,
          defaultValue: 'pending',
        },
        { transaction: t }
      );

      await queryInterface.addColumn(
        'news',
        'push_sent_at',
        { type: Sequelize.DATE, allowNull: true },
        { transaction: t }
      );

      await queryInterface.addColumn(
        'news',
        'push_error',
        { type: Sequelize.TEXT, allowNull: true },
        { transaction: t }
      );

      await queryInterface.addColumn(
        'news',
        'push_topic',
        { type: Sequelize.STRING(64), allowNull: true },
        { transaction: t }
      );

      await queryInterface.addColumn(
        'news',
        'push_collapse_key',
        { type: Sequelize.STRING(64), allowNull: true },
        { transaction: t }
      );

      await queryInterface.addColumn(
        'news',
        'push_deeplink',
        { type: Sequelize.STRING(512), allowNull: true },
        { transaction: t }
      );

      await queryInterface.addColumn(
        'news',
        'push_image_used',
        { type: Sequelize.TEXT, allowNull: true },
        { transaction: t }
      );

      await queryInterface.addColumn(
        'news',
        'push_hash',
        { type: Sequelize.STRING(64), allowNull: true },
        { transaction: t }
      );

      // ====== Indexes ======
      await queryInterface.addIndex(
        'news',
        ['push_state'],
        { name: 'idx_push_state', transaction: t }
      );

      await queryInterface.addIndex(
        'news',
        ['push_sent_at'],
        { name: 'idx_push_sent_at', transaction: t }
      );

      await queryInterface.addIndex(
        'news',
        ['push_hash'],
        { name: 'idx_push_hash', transaction: t }
      );

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // Drop indexes first
      await queryInterface.removeIndex('news', 'idx_push_hash', { transaction: t });
      await queryInterface.removeIndex('news', 'idx_push_sent_at', { transaction: t });
      await queryInterface.removeIndex('news', 'idx_push_state', { transaction: t });

      // Drop columns
      await queryInterface.removeColumn('news', 'push_hash', { transaction: t });
      await queryInterface.removeColumn('news', 'push_image_used', { transaction: t });
      await queryInterface.removeColumn('news', 'push_deeplink', { transaction: t });
      await queryInterface.removeColumn('news', 'push_collapse_key', { transaction: t });
      await queryInterface.removeColumn('news', 'push_topic', { transaction: t });
      await queryInterface.removeColumn('news', 'push_error', { transaction: t });
      await queryInterface.removeColumn('news', 'push_sent_at', { transaction: t });
      await queryInterface.removeColumn('news', 'push_state', { transaction: t });

      // Cleanup ENUM type on Postgres to avoid residue
      const dialect = queryInterface.sequelize.getDialect();
      if (dialect === 'postgres') {
        // Sequelize usually names it "enum_<table>_<column>"
        await queryInterface.sequelize.query(
          'DROP TYPE IF EXISTS "enum_news_push_state";',
          { transaction: t }
        );
      }

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },
};
