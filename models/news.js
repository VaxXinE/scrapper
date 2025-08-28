// models/news.js
module.exports = (sequelize, DataTypes) => {
  const News = sequelize.define('News', {
    title:     { type: DataTypes.TEXT, allowNull: false },
    // Hapus unique tunggal di kolom link
    link:      { type: DataTypes.STRING(512), allowNull: false },
    image:     { type: DataTypes.TEXT, allowNull: true },
    category:  { type: DataTypes.STRING, allowNull: true },
    date:      { type: DataTypes.STRING, allowNull: true },
    summary:   { type: DataTypes.TEXT, allowNull: true },
    detail:    { type: DataTypes.TEXT, allowNull: true },
    language:  { type: DataTypes.STRING(5), allowNull: false }, // 'en' / 'id'
  }, {
    tableName: 'news',
    timestamps: true,
    // Tambah composite unique index di sini
    indexes: [
      {
        unique: true,
        fields: ['link', 'language'],
        name: 'uniq_link_lang'
      },
      // opsional: untuk query sorting/filter
      { fields: ['createdAt'] },
      { fields: ['language'] },
      { fields: ['category'] },
    ],
    hooks: {
      beforeValidate(instance) {
        if (instance.link) {
          instance.link = instance.link.trim();
          // normalisasi: buang trailing slash biar konsisten
          if (instance.link.length > 1 && instance.link.endsWith('/')) {
            instance.link = instance.link.slice(0, -1);
          }
        }
        if (instance.language) instance.language = instance.language.trim().toLowerCase();
      },
    },
  });

  return News;
};
