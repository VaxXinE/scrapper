// migrations/xxxx-add-source-fields.js
module.exports = {
  async up(q, Sequelize) {
    await q.addColumn('news', 'source_name',  { type: Sequelize.STRING, allowNull: false, defaultValue: 'Newsmaker23' });
    await q.addColumn('news', 'source_url',   { type: Sequelize.TEXT,   allowNull: false, defaultValue: '' });
    await q.addColumn('news', 'author',       { type: Sequelize.STRING, allowNull: true });
    await q.addColumn('news', 'author_name',  { type: Sequelize.STRING, allowNull: true }); // 👈 NEW
    await q.addColumn('news', 'published_at', { type: Sequelize.DATE,   allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') });
    await q.addIndex('news', ['published_at']);
  },

  async down(q) {
    await q.removeIndex('news', ['published_at']);
    await q.removeColumn('news', 'source_name');
    await q.removeColumn('news', 'source_url');
    await q.removeColumn('news', 'author');
    await q.removeColumn('news', 'author_name'); // 👈 NEW
    await q.removeColumn('news', 'published_at');
  }
};
