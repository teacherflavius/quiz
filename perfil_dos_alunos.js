let currentProfessorSession = null;
let teacherClasses = [];
let studentClassMap = new Map();
let selectedStudentForClass = null;
let cachedVisibleStudents = [];
let currentStudentFilter = "all";

function redirectToLogin() {
  window.location.href = "login.html?next=" + encodeURIComponent("perfil_dos_alunos.html");
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function waitForAuthResources() {
  for (let i = 0; i < 10; i++) {
    if (window.Auth && window.SUPABASE_CONFIG && Auth.isConfigured()) return true;
    await sleep(150);
  }
  return !!(window.Auth && window.SUPABASE_CONFIG && Auth.isConfigured());
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getStudentRefId(student) {
  return String(student.student_ref_id || student.user_id || student.id || "");
}

function getStudentRefType(student) {
  return String(student.student_ref_type || (student.user_id ? "user" : "invite"));
}

function getStudentMapKey(refType, refId) {
  return String(refType || "user") + ":" + String(refId || "");
}

function isPreEnrolled(student) {
  return getStudentRefType(student) === "invite" || student.pre_enrollment_status === "pending";
}

function isEnrolledStudent(student) {
  return !isPreEnrolled(student) && (
    student.enrolled === true ||
    student.enrolled === "true" ||
    !!student.user_id ||
    student.pre_enrollment_status === "completed"
  );
}

function isVisibleStudent(student) {
  return (
    student.enrolled === true ||
    student.enrolled === "true" ||
    !!student.enrollment_code ||
    !!student.email ||
    !!student.user_id ||
    !!student.id ||
    !!student.invite_id ||
    student.pre_enrollment_status === "pending"
  );
}

function hasAvailability(student) {
  const availability = student.availability || {};
  return Object.keys(availability).some(function (day) {
    return Array.isArray(availability[day]) && availability[day].length > 0;
  });
}

function hasAssignedClass(student) {
  const key = getStudentMapKey(getStudentRefType(student), getStudentRefId(student));
  const classes = studentClassMap.get(key) || [];
  return classes.length > 0;
}

function filterStudents(students) {
  if (currentStudentFilter === "without_class") {
    return students.filter(function (student) { return !hasAssignedClass(student); });
  }

  if (currentStudentFilter === "enrolled") {
    return students.filter(isEnrolledStudent);
  }

  if (currentStudentFilter === "availability") {
    return students.filter(hasAvailability);
  }

  if (currentStudentFilter === "pre_enrolled") {
    return students.filter(isPreEnrolled);
  }

  return students;
}

function getFilterMetadata() {
  const metadata = {
    all: {
      title: "Todos os alunos",
      heading: "Perfis completos",
      empty: "Nenhum aluno matriculado ou pré-matriculado encontrado."
    },
    without_class: {
      title: "Alunos sem turma",
      heading: "Alunos sem turma",
      empty: "Nenhum aluno sem turma encontrado."
    },
    enrolled: {
      title: "Alunos matriculados",
      heading: "Alunos matriculados",
      empty: "Nenhum aluno matriculado encontrado."
    },
    availability: {
      title: "Disponibilidade dos alunos",
      heading: "Alunos com disponibilidade informada",
      empty: "Nenhum aluno com disponibilidade informada encontrado."
    },
    pre_enrolled: {
      title: "Alunos pré-matriculados",
      heading: "Alunos pré-matriculados",
      empty: "Nenhum aluno pré-matriculado encontrado."
    }
  };

  return metadata[currentStudentFilter] || metadata.all;
}

function updateStudentCount(count) {
  const countEl = document.getElementById("studentCountNumber");
  if (countEl) countEl.textContent = String(count || 0);

  const titleEl = document.getElementById("studentCountTitle");
  const descriptionEl = document.getElementById("studentCountDescription");
  const metadata = getFilterMetadata();

  if (titleEl) titleEl.textContent = metadata.title;
  if (descriptionEl) descriptionEl.textContent = "Contagem atual conforme o filtro selecionado.";
}

function formatCpf(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 11) return value || "Não informado";
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

function formatWhatsapp(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "Não informado";
  if (digits.length === 11) return digits.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (digits.length === 10) return digits.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return value || digits;
}

function formatAvailability(profile) {
  const days = [["seg", "Segunda"], ["ter", "Terça"], ["qua", "Quarta"], ["qui", "Quinta"], ["sex", "Sexta"]];
  const hourLabels = { "09": "9h - 10h", "10": "10h - 11h", "12": "12h - 13h", "13": "13h - 14h", "15": "15h - 16h", "17": "17h - 18h", "18": "18h - 19h", "20": "20h - 21h", "21": "21h - 22h" };
  const availability = profile.availability || {};
  const parts = days.map(function (day) {
    const values = Array.isArray(availability[day[0]]) ? availability[day[0]] : [];
    if (!values.length) return "";
    return '<p><b>' + day[1] + ':</b> ' + values.map(function (hour) { return escapeHtml(hourLabels[hour] || hour); }).join(", ") + '</p>';
  }).filter(Boolean);
  return parts.length ? parts.join("") : '<p>Não informado</p>';
}

function formatCreatedAt(value) {
  if (!value) return "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getStudentClassNames(student) {
  const key = getStudentMapKey(getStudentRefType(student), getStudentRefId(student));
  const classes = studentClassMap.get(key) || [];
  return classes.length ? classes.join(", ") : "Nenhuma turma atribuída";
}

async function loadStudents() {
  const client = Auth.getClient();
  const response = await client.rpc("get_teacher_students");
  if (response.error) throw response.error;
  return response.data || [];
}

async function loadTeacherClasses() {
  const client = Auth.getClient();
  const response = await client.rpc("get_teacher_classes");
  if (response.error) throw response.error;
  teacherClasses = response.data || [];
  return teacherClasses;
}

async function loadStudentClassMap() {
  const client = Auth.getClient();
  const map = new Map();

  for (const classItem of teacherClasses) {
    const response = await client.rpc("get_teacher_class_students", { target_class_number: Number(classItem.class_number) });
    if (response.error) throw response.error;

    (response.data || []).forEach(function (row) {
      const refId = row.student_ref_id || row.user_id || row.invite_id;
      const refType = row.student_ref_type || (row.user_id ? "user" : "invite");
      const key = getStudentMapKey(refType, refId);
      const className = classItem.class_name || ("Turma " + classItem.class_number);
      const current = map.get(key) || [];
      if (!current.includes(className)) current.push(className);
      map.set(key, current);
    });
  }

  studentClassMap = map;
  return studentClassMap;
}

async function deleteStudent(userId, studentName, button) {
  const confirmed = window.confirm("Excluir definitivamente o aluno " + studentName + "? Esta ação remove a conta de login, o perfil, frequência e registros de exercícios vinculados a esse aluno.");
  if (!confirmed) return;

  button.disabled = true;
  button.textContent = "EXCLUINDO...";

  try {
    const client = Auth.getClient();
    const response = await client.rpc("delete_teacher_student", { target_user_id: userId });
    if (response.error) throw response.error;
    await loadStudentClassMap();
    await renderStudentProfiles();
  } catch (error) {
    alert("Não foi possível excluir o aluno: " + (error.message || "erro desconhecido") + ". Reexecute o arquivo supabase_professor_admin.sql no Supabase.");
    button.disabled = false;
    button.textContent = "EXCLUIR ALUNO";
  }
}

function openClassAssignmentModal(refId, refType, studentName) {
  selectedStudentForClass = { refId: refId, refType: refType, studentName: studentName };
  const modal = document.getElementById("classAssignmentModal");
  const nameLabel = document.getElementById("classAssignmentStudentName");
  const message = document.getElementById("classAssignmentMessage");
  const select = document.getElementById("classAssignmentSelect");

  if (nameLabel) nameLabel.textContent = "Aluno: " + studentName;
  if (message) {
    message.className = "empty";
    message.textContent = "";
  }

  if (select) {
    if (!teacherClasses.length) {
      select.innerHTML = '<option value="">Nenhuma turma criada</option>';
    } else {
      select.innerHTML = '<option value="">Selecione uma turma</option>' + teacherClasses.map(function (item) {
        return '<option value="' + escapeHtml(item.class_number) + '">' + escapeHtml(item.class_name || ("Turma " + item.class_number)) + '</option>';
      }).join("");
    }
  }

  if (modal) {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }
}

function closeClassAssignmentModal() {
  const modal = document.getElementById("classAssignmentModal");
  selectedStudentForClass = null;
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
}

async function saveClassAssignment() {
  const message = document.getElementById("classAssignmentMessage");
  const select = document.getElementById("classAssignmentSelect");
  const button = document.getElementById("saveClassAssignmentButton");

  if (!selectedStudentForClass) return;
  const classNumber = select ? Number(select.value) : null;
  if (!classNumber) {
    message.className = "error";
    message.textContent = "Selecione uma turma.";
    return;
  }

  button.disabled = true;
  button.textContent = "SALVANDO...";
  message.className = "empty";
  message.textContent = "Atribuindo turma ao aluno...";

  try {
    const client = Auth.getClient();
    const response = await client.rpc("add_teacher_class_student_by_ref", {
      target_class_number: classNumber,
      target_student_ref_id: selectedStudentForClass.refId,
      target_student_ref_type: selectedStudentForClass.refType
    });
    if (response.error) throw response.error;

    await loadStudentClassMap();
    await renderStudentProfiles();
    closeClassAssignmentModal();
  } catch (error) {
    message.className = "error";
    message.textContent = "Não foi possível atribuir a turma: " + (error.message || "erro desconhecido") + ". Execute supabase_pre_matriculas_turmas.sql no Supabase.";
  } finally {
    button.disabled = false;
    button.textContent = "SALVAR TURMA";
  }
}

function attachActionButtons() {
  document.querySelectorAll(".delete-student-button").forEach(function (button) {
    button.addEventListener("click", function () {
      deleteStudent(button.dataset.userId, button.dataset.studentName || "este aluno", button);
    });
  });

  document.querySelectorAll(".assign-class-button").forEach(function (button) {
    button.addEventListener("click", function () {
      openClassAssignmentModal(button.dataset.refId, button.dataset.refType, button.dataset.studentName || "Aluno");
    });
  });
}

function renderProfileCard(student) {
  const preEnrolled = isPreEnrolled(student);
  const refId = getStudentRefId(student);
  const refType = getStudentRefType(student);
  const userId = student.user_id || "";
  const studentName = student.name || student.email || "Aluno sem nome";
  const assignedClasses = getStudentClassNames(student);
  const pillLabel = preEnrolled ? "Pré-matriculado" : "Matriculado";
  const sourceLabel = preEnrolled ? "Pré-matrícula por convite" : (student.source || "Não informado");

  const editButton = userId
    ? '<a class="delete-button" href="editar_aluno.html?id=' + encodeURIComponent(userId) + '" style="display:inline-flex; justify-content:center; text-decoration:none; border-color:rgba(129,140,248,0.45); background:rgba(129,140,248,0.10); color:#c4b5fd;">EDITAR DADOS</a>'
    : '<a class="delete-button" href="pre-matriculas.html" style="display:inline-flex; justify-content:center; text-decoration:none; border-color:rgba(129,140,248,0.45); background:rgba(129,140,248,0.10); color:#c4b5fd;">VER CONVITE</a>';

  const deleteButton = userId
    ? '<button class="delete-button delete-student-button" type="button" data-user-id="' + escapeHtml(userId) + '" data-student-name="' + escapeHtml(studentName) + '" style="border-color:rgba(248,113,113,0.55); background:rgba(248,113,113,0.10); color:#fca5a5;">EXCLUIR ALUNO</button>'
    : '';

  return '<div class="student-card">' +
    '<strong>' + escapeHtml(studentName) +
      '<span class="pill ' + (preEnrolled ? 'pending' : '') + '">' + pillLabel + '</span>' +
    '</strong>' +
    '<p><b>Turma:</b> ' + escapeHtml(assignedClasses) + '</p>' +
    '<p><b>Código de convite / matrícula:</b> ' + escapeHtml(student.enrollment_code || "Não informado") + '</p>' +
    '<p><b>Nome completo:</b> ' + escapeHtml(student.name || "Não informado") + '</p>' +
    '<p><b>E-mail:</b> ' + escapeHtml(student.email || "Não informado") + '</p>' +
    '<p><b>CPF:</b> ' + escapeHtml(formatCpf(student.cpf)) + '</p>' +
    '<p><b>WhatsApp:</b> ' + escapeHtml(formatWhatsapp(student.whatsapp)) + '</p>' +
    '<p><b>Chave PIX:</b> ' + escapeHtml(student.pix_key || "Não informado") + '</p>' +
    '<p><b>Referência:</b> ' + escapeHtml(refType + ':' + refId) + '</p>' +
    '<p><b>Origem do registro:</b> ' + escapeHtml(sourceLabel) + '</p>' +
    '<p><b>Status da pré-matrícula:</b> ' + escapeHtml(student.pre_enrollment_status || (preEnrolled ? "pending" : "completed")) + '</p>' +
    '<p><b>Criado em:</b> ' + escapeHtml(formatCreatedAt(student.created_at)) + '</p>' +
    '<div style="margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.08);">' +
      '<p><b>Disponibilidade para aulas:</b></p>' + formatAvailability(student) +
    '</div>' +
    '<div class="student-actions">' +
      '<button class="delete-button assign-class-button" type="button" data-ref-id="' + escapeHtml(refId) + '" data-ref-type="' + escapeHtml(refType) + '" data-student-name="' + escapeHtml(studentName) + '" style="border-color:rgba(129,140,248,0.45); background:rgba(129,140,248,0.10); color:#c4b5fd;">TURMA</button>' +
      editButton +
      deleteButton +
    '</div>' +
  '</div>';
}

function renderFilteredStudents() {
  const list = document.getElementById("studentProfilesList");
  const title = document.getElementById("studentProfilesTitle");
  const metadata = getFilterMetadata();
  const filteredStudents = filterStudents(cachedVisibleStudents);

  if (title) title.textContent = metadata.heading;
  updateStudentCount(filteredStudents.length);

  if (!filteredStudents.length) {
    list.className = "empty";
    list.textContent = metadata.empty;
    return;
  }

  list.className = "";
  list.innerHTML = filteredStudents.map(renderProfileCard).join("");
  attachActionButtons();
}

async function renderStudentProfiles() {
  const list = document.getElementById("studentProfilesList");
  try {
    const students = await loadStudents();
    cachedVisibleStudents = students.filter(isVisibleStudent);
    renderFilteredStudents();
  } catch (error) {
    updateStudentCount(0);
    list.className = "error";
    list.textContent = "Não foi possível carregar os perfis dos alunos: " + (error.message || "erro desconhecido") + ". Execute supabase_pre_matriculas_turmas.sql no Supabase.";
  }
}

function setupFilterEvents() {
  const filterSelect = document.getElementById("studentStatusFilter");
  if (!filterSelect) return;

  filterSelect.addEventListener("change", function () {
    currentStudentFilter = filterSelect.value || "all";
    renderFilteredStudents();
  });
}

function setupModalEvents() {
  const closeButton = document.getElementById("closeClassAssignmentModalButton");
  const cancelButton = document.getElementById("cancelClassAssignmentButton");
  const saveButton = document.getElementById("saveClassAssignmentButton");
  const modal = document.getElementById("classAssignmentModal");

  if (closeButton) closeButton.addEventListener("click", closeClassAssignmentModal);
  if (cancelButton) cancelButton.addEventListener("click", closeClassAssignmentModal);
  if (saveButton) saveButton.addEventListener("click", saveClassAssignment);
  if (modal) {
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeClassAssignmentModal();
    });
  }
}

async function guardPage() {
  const status = document.getElementById("adminStatus");
  const resourcesReady = await waitForAuthResources();
  if (!resourcesReady) {
    status.textContent = "Não foi possível carregar a autenticação. Atualize a página ou limpe o cache do navegador.";
    document.body.classList.remove("auth-checking");
    return;
  }
  currentProfessorSession = await Auth.getSession();
  if (!currentProfessorSession || !currentProfessorSession.user) {
    redirectToLogin();
    return;
  }
  status.textContent = "Professor autenticado: " + currentProfessorSession.user.email + ".";
  document.body.classList.remove("auth-checking");
  setupModalEvents();
  setupFilterEvents();
  await loadTeacherClasses();
  await loadStudentClassMap();
  await renderStudentProfiles();
}

guardPage();
