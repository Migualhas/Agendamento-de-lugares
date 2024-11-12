let siglaSelecionada = localStorage.getItem("siglaSelecionada") || "ADM"; // Recupera a sigla ou usa "ADM" como padrão

// Atualiza o dropdown e o mapa com a seleção armazenada
document.addEventListener("DOMContentLoaded", () => {
    const administrativoDropdown = document.getElementById("administrativoDropdown");
    const mapaImagem = document.getElementById("mapaImagem");

    // Encontra o texto correspondente à sigla armazenada e atualiza o botão e imagem
    const selecionado = document.querySelector(`.dropdown-content a[data-sigla="${siglaSelecionada}"]`);
    administrativoDropdown.textContent = selecionado ? selecionado.textContent : "⬇ Administrativo";
    mapaImagem.src = `m_${siglaSelecionada.toLowerCase()}.svg`;

    carregarPostos(); // Carrega os postos com a sigla selecionada
});

document.querySelectorAll(".dropdown-content a").forEach(item => {
    item.addEventListener("click", (event) => {
        event.preventDefault(); // Previne o redirecionamento padrão

        // Atualiza a sigla selecionada e salva no localStorage
        siglaSelecionada = item.getAttribute("data-sigla");
        localStorage.setItem("siglaSelecionada", siglaSelecionada);

        // Atualiza o texto do botão dropdown com o item selecionado
        const administrativoDropdown = document.getElementById("administrativoDropdown");
        administrativoDropdown.textContent = item.textContent;

        // Atualiza a imagem no div "mapa" com base na sigla selecionada
        const mapaImagem = document.getElementById("mapaImagem");
        mapaImagem.src = `m_${siglaSelecionada.toLowerCase()}.svg`;

        // Recarrega os postos com a nova sigla selecionada
        carregarPostos();
    });
});

async function carregarPostos() {
    try {
        const response = await fetch('/select/lugares');
        const responseText = await response.text();
        console.log("Resposta da API:", responseText);
        const lugares = JSON.parse(responseText);

        if (response.ok) {
            const ilhasDiv = document.getElementById("ilhas");
            if (!ilhasDiv) {
                console.error("Elemento com ID 'ilhas' não encontrado.");
                return;
            }

            ilhasDiv.innerHTML = ""; // Limpa o conteúdo atual antes de adicionar novos itens

            const ilhas = {};
            lugares
                .filter(lugar => lugar.Posto.includes(siglaSelecionada)) // Aplica a sigla selecionada no filtro
                .forEach(lugar => {
                    const { Posto, ilha, disponivel } = lugar;

                    if (!ilhas[ilha]) {
                        ilhas[ilha] = [];
                    }
                    ilhas[ilha].push({ Posto, disponivel });
                });

            Object.entries(ilhas).forEach(([ilha, postos]) => {
                const ilhaDiv = document.createElement("div");
                ilhaDiv.classList.add("ilha");

                const ilhaTitulo = document.createElement("h2");
                ilhaTitulo.textContent = ilha;
                ilhaDiv.appendChild(ilhaTitulo);

                postos.forEach(({ Posto, disponivel }) => {
                    const postoDiv = document.createElement("div");
                    postoDiv.classList.add("posto");
                    postoDiv.textContent = `${Posto} - ${disponivel}`;

                    if (disponivel === "Ocupado") {
                        postoDiv.classList.add("ocupado");
                        postoDiv.title = "Este posto está Ocupado";
                    } else {
                        postoDiv.addEventListener("click", () => {
                            abrirFormularioAgendamento(Posto, ilha);
                        });
                    }

                    ilhaDiv.appendChild(postoDiv);
                });

                ilhasDiv.appendChild(ilhaDiv);
            });
        } else {
            console.error("Erro ao buscar dados:", lugares.error);
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
    }
}

carregarPostos();

async function verificarMatricula(matricula) {
  try {
    const response = await fetch(`/check-matricula?matricula=${matricula}`);
    if (!response.ok) {
      throw new Error("Erro ao verificar matrícula.");
    }
    const data = await response.json();
    return data.cadastrada; // Assume que a API retorna { cadastrada: true/false }
  } catch (error) {
    console.error("Erro ao verificar matrícula:", error);
    return false; // Assume que a matrícula não está cadastrada em caso de erro
  }
}

function mostrarMensagem(mensagem) {
  // Criação do overlay
  let overlay = document.createElement("div");
  overlay.className = "mensagem-overlay"; // Classe CSS para o overlay
  document.body.appendChild(overlay);

  // Criação da caixa de mensagem
  let msgDiv = document.createElement("div");
  msgDiv.className = "mensagem-conteudo"; // Classe CSS para o conteúdo da mensagem
  msgDiv.innerText = mensagem;

  // Adiciona a caixa de mensagem dentro do overlay
  overlay.appendChild(msgDiv);

  // Função para fechar a mensagem após 3 segundos
  setTimeout(() => {
    overlay.remove(); // Remove o overlay e a mensagem
  }, 3000); // 3 segundos
}


async function abrirFormularioAgendamento(posto, ilha) {
  const modal = document.getElementById('agendamentoModal');
  const loading = document.getElementById('loading');
  modal.style.display = 'block';

  document.getElementById('formAgendamento').onsubmit = async function (event) {
    event.preventDefault();

    const nomeCompleto = document.getElementById('nomeCompleto').value;
    const matricula = document.getElementById('matricula').value;
    const aiu = document.getElementById('aiu').value;
    const dataInicio = document.getElementById('dataInicio').value;
    const dataFim = document.getElementById('dataFim').value;
    const horarioInicio = document.getElementById('horarioInicio').value;
    const horarioFim = document.getElementById('horarioFim').value;

    const cadastrada = await verificarMatricula(matricula);
    if (cadastrada) {
      mostrarMensagem("Esta matrícula já está cadastrada.");
      return;
    }

    console.log("Dados do formulário:", { nomeCompleto, matricula, aiu, dataInicio, dataFim, horarioInicio, horarioFim });

    loading.style.display = 'flex';

    const agendamento = {
      posto,
      ilha,
      contratante_matricula: matricula,
      data_inicio: dataInicio,
      data_fim: dataFim,
      horario_inicio: horarioInicio,
      horario_fim: horarioFim,
      nome_completo: nomeCompleto,
      aiu: aiu
    };

    const contratante = {
      matricula,
      nome_completo: nomeCompleto,
      aiu
    };

    try {
      const contratanteResponse = await fetch('/insert/Contratante', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contratante)
      });

      if (!contratanteResponse.ok) {
        throw new Error(`Erro ao inserir contratante: ${contratanteResponse.statusText}`);
      }

      const agendamentoResponse = await fetch('/insert/Agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agendamento)
      });

      if (!agendamentoResponse.ok) {
        throw new Error(`Erro ao inserir agendamento: ${agendamentoResponse.statusText}`);
      }

      const updateResponse = await fetch('/update/PostoDisponibilidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posto, ilha, disponivel: 'Ocupado' })
      });

      if (!updateResponse.ok) {
        throw new Error(`Erro ao atualizar disponibilidade: ${updateResponse.statusText}`);
      }

      const emailResponse = await fetch('/sendEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(agendamento)
      });

      if (!emailResponse.ok) {
        throw new Error(`Erro ao enviar e-mail: ${emailResponse.statusText}`);
      }

      alert('Agendamento confirmado e e-mail enviado!');
      modal.style.display = 'none';

      
      window.location.reload();

    } catch (error) {
      console.error('Erro ao agendar:', error);
      alert('Erro ao agendar o posto. Tente novamente.');
    } finally {
      loading.style.display = 'none';
    }
  };

  // Lógica para fechar o modal
  document.getElementById('fecharModal').addEventListener('click', () => {
    modal.style.display = 'none';
  });

  window.addEventListener('click', (event) => {
    if (event.target === modal) {
      modal.style.display = 'none';
    }
  });
}
