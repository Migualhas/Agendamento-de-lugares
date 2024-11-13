// Função para buscar dados
function fetchData() {
    const table = document.getElementById('table-select').value;
    const id = document.getElementById('id-input').value;

    let url = `/select/${table}`;
    if (id) url += `/${id}`;

    fetch(url)
        .then(response => response.json())
        .then(data => {
            displayResults(data);
        })
        .catch(error => {
            console.error('Erro ao buscar dados:', error);
        });
}

// Função para exibir resultados na tabela
function displayResults(data) {
    const resultTable = document.getElementById('result-table');
    resultTable.querySelector('thead').innerHTML = '';
    resultTable.querySelector('tbody').innerHTML = '';

    if (!data || (Array.isArray(data) && data.length === 0)) {
        resultTable.querySelector('tbody').innerHTML = '<tr><td colspan="100%">Nenhum resultado encontrado</td></tr>';
        return;
    }

    const rows = Array.isArray(data) ? data : [data];
    const columns = Object.keys(rows[0]);

    const theadRow = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        theadRow.appendChild(th);
    });
    resultTable.querySelector('thead').appendChild(theadRow);

    rows.forEach(row => {
        const tr = document.createElement('tr');
        columns.forEach(col => {
            const td = document.createElement('td');
            td.textContent = row[col];
            tr.appendChild(td);
        });
        resultTable.querySelector('tbody').appendChild(tr);
    });
}

// Função para remover dados
function deleteData() {
    const table = document.getElementById('delete-table-select').value;
    const id = document.getElementById('delete-id-input').value;

    if (!id) {
        alert('Por favor, insira um ID para remover');
        return;
    }

    fetch(`/delete/${table}/${id}`, { method: 'GET' })
        .then(response => response.json())
        .then(data => {
            if (data.changes > 0) {
                alert('Registro removido com sucesso');
                fetchData(); // Atualiza os dados após a remoção
            } else {
                alert('Nenhum registro encontrado com esse ID');
            }
        })
        .catch(error => {
            console.error('Erro ao remover dados:', error);
        });
}
document.getElementById('upload-form').addEventListener('submit', function (event) {
    event.preventDefault(); // Evitar o envio padrão do formulário

    const formData = new FormData(this);

    fetch('/importar-postos', {
        method: 'POST',
        body: formData,
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Erro ao importar dados.');
        }
        return response.json();
    })
    .then(data => {
        document.getElementById('message').textContent = data.message;
        document.getElementById('message').style.color = 'green';
    })
    .catch(error => {
        document.getElementById('message').textContent = error.message;
        document.getElementById('message').style.color = 'red';
    });
});