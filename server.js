const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const fileUpload = require('express-fileupload');
const ExcelJS = require('exceljs');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
require('dotenv').config(); // Adicione esta linha para carregar variáveis de ambiente
const app = express();
app.use(fileUpload());
app.use(express.json());
app.use(cors());

// Configura o diretório público para servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Rota para a página inicial
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const HOST_EMAIL = process.env.HOST_EMAIL;

let transporter = nodemailer.createTransport({
  host: HOST_EMAIL,
  port: 25,
  secure: false,
  tls: {
    rejectUnauthorized: false
  }
});


// Conexão com o banco de dados SQLite
let db = new sqlite3.Database('./database.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the database.');
});

// Criação das tabelas
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS lugares (
            Posto TEXT NOT NULL,
            ilha TEXT NOT NULL,
            disponivel TEXT DEFAULT 'Livre',
            PRIMARY KEY (posto, ilha)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS Contratante (
            matricula INTEGER PRIMARY KEY,
            aiu TEXT,
            nome_completo TEXT NOT NULL
        );
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS Agendamentos (
        id_Agendamentos INTEGER PRIMARY KEY AUTOINCREMENT,
        posto TEXT NOT NULL,
        ilha TEXT NOT NULL,
        contratante_matricula INTEGER NOT NULL,
        nome_completo TEXT NOT NULL,
        data_inicio DATE NOT NULL,
        data_fim DATE NOT NULL,
        horario_inicio TIME NOT NULL,
        horario_fim TIME NOT NULL,
        aiu TEXT,  -- Adicionando a coluna aiu
        notificado INTEGER DEFAULT 0,  -- Adicionando a coluna notificado
        FOREIGN KEY(contratante_matricula) REFERENCES Contratante(matricula),
        FOREIGN KEY(posto) REFERENCES lugares(posto)
      );
    `);
    
  
});

app.post('/insert/:table', (req, res) => {
  let table = req.params.table;
  let data = req.body;

  console.log("Tabela:", table);
  console.log("Dados recebidos:", data);

  let keys = Object.keys(data).join(',');
  let placeholders = Object.keys(data).map(() => '?').join(',');
  let values = Object.values(data);
  let sql = `INSERT INTO ${table} (${keys}) VALUES (${placeholders})`;

  console.log("SQL gerado:", sql);
  console.log("Valores:", values);

  db.run(sql, values, function(err) {
    if (err) {
      console.error("Erro ao executar SQL:", err.message);
      return res.status(400).json({ error: err.message });
    }
    res.json({ lastID: this.lastID });
  });
});


app.put('/update/:table/:id', (req, res) => {
  let table = req.params.table;
  let id = req.params.id;
  let data = req.body;
  let updates = Object.keys(data).map(key => `${key} = ?`).join(',');
  let values = Object.values(data).concat(id);
  let sql = `UPDATE ${table} SET ${updates} WHERE rowid = ?`;

  db.run(sql, values, function(err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json({ changes: this.changes });
  });
});

app.get('/delete/:table/:id', (req, res) => {
  let table = req.params.table;
  let id = req.params.id;
  let sql = `DELETE FROM ${table} WHERE rowid = ?`;

  db.run(sql, [id], function(err) {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json({ changes: this.changes });
  });
});

app.get('/select/:table/:id', (req, res) => {
  let table = req.params.table;
  let id = req.params.id;
  let sql = `SELECT * FROM ${table} WHERE rowid = ?`;

  db.get(sql, [id], (err, row) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json(row);
  });
});

app.get('/select/:table', (req, res) => {
  let table = req.params.table;
  sql = `SELECT * FROM ${table}`;
  db.all(sql, [], (err, rows) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/importar-postos', async (req, res) => {
  if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'Nenhum arquivo foi enviado.' });
  }

  const file = req.files.file;
  const workbook = new ExcelJS.Workbook();

  try {
      // Carregar o arquivo Excel
      await workbook.xlsx.load(file.data);
      const worksheet = workbook.getWorksheet(1);
      const postosData = [];

      // Iterar sobre as linhas, começando da segunda para ignorar o cabeçalho
      worksheet.eachRow((row, rowNumber) => {
          if (rowNumber > 1) {
              const ilha = row.getCell(1).value; // Corrigido: ilha está na coluna 1
              const posto = row.getCell(2).value; // Corrigido: posto está na coluna 2
              const disponivel = row.getCell(3).value || 'Livre';

              // Verificar se posto e ilha não são nulos ou indefinidos
              if (posto && ilha) {
                  postosData.push({ posto, ilha, disponivel });
              }
          }
      });

      // Inserir dados na tabela lugares
      const insertStmt = `INSERT OR IGNORE INTO lugares (posto, ilha, disponivel) VALUES (?, ?, ?)`;
      const insert = db.prepare(insertStmt);
      postosData.forEach(({ posto, ilha, disponivel }) => {
          insert.run([posto, ilha, disponivel]);
      });
      insert.finalize();

      res.json({ message: 'Dados importados com sucesso!' });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro ao processar o arquivo Excel.' });
  }
});


// Rota para enviar e-mail de confirmação
app.post('/sendEmail', (req, res) => {
  const { posto, aiu, data_inicio, data_fim, ilha, nome_completo } = req.body;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: `${aiu}@amway.com`,
    subject: 'Confirmação de Agendamento',
    html: `
      <div style="font-family: Arial, sans-serif; color: #333;">
        <h2 style="color: #007bff;">Confirmação de Agendamento</h2>
        <p>Olá ${nome_completo},</p>
        <p>Seu agendamento para o posto <strong>${posto}</strong> na ilha <strong>${ilha}</strong> foi confirmado para o período de:</p>
        <ul>
          <li><strong>Data de Início:</strong> ${data_inicio}</li>
          <li><strong>Data de Fim:</strong> ${data_fim}</li>
        </ul>
        <p>Agendamento Refeições e Transporte: <a href="http://brnx01:8081/">Clique aqui</a></p>
        <p>Se você tiver alguma dúvida, entre em contato conosco.</p>
        <p>Atenciosamente,</p>
        <p><strong>TI</strong></p>
      </div>
    `
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json({ message: 'E-mail de confirmação enviado com sucesso!' });
  });
});




function sendEmail(to, subject, html) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: subject,
    html: html
  };

  console.log('Enviando email para:', to);
  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Erro ao enviar e-mail:', error);
    } else {
      console.log('E-mail enviado:', info.response);
    }
  });
}

//Isso agendará a tarefa para ser executada todos os dias às 7 da manhã. Se precisar de mais alguma coisa, é só avisar!

cron.schedule('0 7 * * *', () => {
  console.log('Cron job rodando...');
  const today = new Date();
  const twoDaysLater = new Date(today);
  twoDaysLater.setDate(today.getDate() + 2);

  const todayStr = today.toISOString().split('T')[0];
  const twoDaysLaterStr = twoDaysLater.toISOString().split('T')[0];

  console.log(`Verificando agendamentos para hoje (${todayStr}) e daqui a dois dias (${twoDaysLaterStr})`);

  // Verificar agendamentos que terminam em 2 dias e não foram notificados
  db.all(`SELECT * FROM Agendamentos WHERE data_fim = ? AND notificado = 0`, [twoDaysLaterStr], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar agendamentos:', err.message);
      return;
    }
    console.log(`Agendamentos encontrados para daqui a dois dias: ${rows.length}`);
    rows.forEach(row => {
      console.log('Dados do agendamento:', row);
      db.get(`SELECT aiu, nome_completo FROM Contratante WHERE matricula = ?`, [row.contratante_matricula], (err, contratante) => {
        if (err) {
          console.error('Erro ao buscar contratante:', err.message);
          return;
        }
        console.log(`Enviando email de alerta para: ${contratante.nome_completo}, Ilha: ${row.ilha}`);
        const emailContent = `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #007bff;">Alerta de Agendamento</h2>
            <p>Olá ${contratante.nome_completo},</p>
            <p>Seu agendamento para o posto <strong>${row.posto}</strong> na ilha <strong>${row.ilha}</strong> termina em 2 dias.</p>
            <p>Se você tiver alguma dúvida, entre em contato conosco.</p>
            <p>Atenciosamente,</p>
            <p><strong>TI</strong></p>
          </div>
        `;
        sendEmail(`${contratante.aiu}@amway.com`, 'Alerta de Agendamento', emailContent);

        // Marcar o agendamento como notificado
        db.run(`UPDATE Agendamentos SET notificado = 1 WHERE id = ?`, [row.id], (err) => {
          if (err) {
            console.error('Erro ao marcar agendamento como notificado:', err.message);
          } else {
            console.log(`Agendamento ${row.id} marcado como notificado`);
          }
        });
      });
    });
  });

  // Verificar agendamentos que terminam hoje e apagar dados
  db.all(`SELECT * FROM Agendamentos WHERE data_fim = ?`, [todayStr], (err, rows) => {
    if (err) {
      console.error('Erro ao buscar agendamentos:', err.message);
      return;
    }
    console.log(`Agendamentos encontrados para hoje: ${rows.length}`);
    rows.forEach(row => {
      console.log('Dados do agendamento:', row);
      db.get(`SELECT aiu, nome_completo FROM Contratante WHERE matricula = ?`, [row.contratante_matricula], (err, contratante) => {
        if (err) {
          console.error('Erro ao buscar contratante:', err.message);
          return;
        }
        console.log(`Enviando email de fim de agendamento para: ${contratante.nome_completo}, Ilha: ${row.ilha}`);
        const emailContent = `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #007bff;">Fim do Agendamento</h2>
            <p>Olá ${contratante.nome_completo},</p>
            <p>Seu agendamento para o posto <strong>${row.posto}</strong> na ilha <strong>${row.ilha}</strong> terminou hoje.</p>
            <p>Se você tiver alguma dúvida, entre em contato conosco.</p>
            <p>Atenciosamente,</p>
            <p><strong>TI</strong></p>
          </div>
        `;
        sendEmail(`${contratante.aiu}@amway.com`, 'Fim do Agendamento', emailContent);

        // Atualizar a disponibilidade da ilha para "Livre"
        db.run(`UPDATE lugares SET disponivel = 'Livre' WHERE posto = ? AND ilha = ?`, [row.posto, row.ilha], (err) => {
          if (err) {
            console.error('Erro ao atualizar disponibilidade do posto:', err.message);
          } else {
            console.log(`Disponibilidade do posto ${row.posto} na ilha ${row.ilha} atualizada para 'Livre'`);
          }
        });

        // Apagar dados do contratante e do agendamento
        db.run(`DELETE FROM Contratante WHERE matricula = ?`, [row.contratante_matricula], (err) => {
          if (err) {
            console.error('Erro ao apagar contratante:', err.message);
          }
        });
        db.run(`DELETE FROM Agendamentos WHERE id = ?`, [row.id], (err) => {
          if (err) {
            console.error('Erro ao apagar agendamento:', err.message);
          }
        });
      });
    });
  });
});


app.post('/update/PostoDisponibilidade', async (req, res) => {
  const { posto, ilha, disponivel } = req.body;

  try {
    // Verifique se os parâmetros foram fornecidos corretamente
    if (!posto || !ilha || !disponivel) {
      return res.status(400).json({ message: 'Parâmetros inválidos' });
    }

    // Comando para atualizar a disponibilidade do posto
    const query = 'UPDATE lugares SET disponivel = ? WHERE posto = ? AND ilha = ?';
    
    db.run(query, [disponivel, posto, ilha], function(err) {
      if (err) {
        console.error('Erro ao atualizar disponibilidade:', err);
        return res.status(500).json({ message: 'Erro ao atualizar disponibilidade' });
      }

      // Se a atualização afetou 0 linhas, significa que o posto ou ilha não existem
      if (this.changes === 0) {
        return res.status(404).json({ message: 'Posto ou ilha não encontrados' });
      }

      res.status(200).json({ message: 'Disponibilidade atualizada com sucesso' });
    });

  } catch (error) {
    console.error('Erro ao atualizar disponibilidade:', error);
    res.status(500).json({ message: 'Erro ao atualizar disponibilidade' });
  }
});

// Rota para verificar se a matrícula está cadastrada
app.get('/check-matricula', (req, res) => {
  const matricula = req.query.matricula; // Obtém a matrícula da query string

  // Verifica se a matrícula foi fornecida
  if (!matricula) {
      return res.status(400).json({ error: 'Matrícula não fornecida.' });
  }

  // Consulta ao banco de dados
  db.get(`SELECT COUNT(*) AS count FROM Contratante WHERE matricula = ?`, [matricula], (err, row) => {
      if (err) {
          console.error(err.message);
          return res.status(500).json({ error: 'Erro ao acessar o banco de dados.' });
      }

      // Verifica se a matrícula já está cadastrada
      if (row.count > 0) {
          return res.json({ cadastrada: true }); // Matrícula já cadastrada
      } else {
          return res.json({ cadastrada: false }); // Matrícula não cadastrada
      }
  });
});

app.get('/agendamentos', (req, res) => {
  const { matricula, aiu, nome_completo } = req.query;

  let query = 'SELECT * FROM Agendamentos WHERE 1=1';
  let params = [];

  if (matricula) {
      query += ' AND contratante_matricula = ?';
      params.push(matricula);
  }
  if (aiu) {
      query += ' AND aiu = ?';
      params.push(aiu);
  }
  if (nome_completo) {
      query += ' AND nome_completo = ?';
      params.push(nome_completo);
  }

  db.all(query, params, (err, rows) => {
      if (err) {
          console.error(err.message);
          res.status(500).send('Erro ao buscar agendamentos');
          return;
      }
      res.json(rows);
  });
});


// Rota para a página de administração
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// Rota para a página de administração
app.get('/lugares', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cadastros.html'));
});

// Rota para a página de administração
app.get('/verificar', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'verificar.html'));
});


// Iniciar o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
