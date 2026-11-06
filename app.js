
// ============================================
// GESTOR DE NOTAS - PANEL DOCENTE
// ============================================

"use strict";

const KEY = "gestor-notas-docente-v1";
const MAX = 5;

const $ = (selector) => document.querySelector(selector);

const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

const format = (value) =>
  value.toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ============================================
// ALMACENAMIENTO
// ============================================

function fresh() {
  return {
    current: null,
    courses: [],
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && Array.isArray(saved.courses)) {
      return saved;
    }
  } catch (error) {
    console.error("Error al cargar:", error);
  }
  return fresh();
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (error) {
    notify("No se pudieron guardar los datos.");
    console.error(error);
  }
}

function notify(message) {
  $("#mensaje").textContent = message;
}

function selected() {
  return state.courses.find(
    (course) => course.id === state.current
  ) || null;
}

function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

// ============================================
// CÁLCULOS ACADÉMICOS
// ============================================

function weights(course) {
  return course.activities.reduce(
    (sum, activity) => sum + activity.weight,
    0
  );
}

function hasGrade(student, activityId) {
  return typeof student.grades[activityId] === "number"
    && Number.isFinite(student.grades[activityId]);
}

function pendingCount(student, activities) {
  return activities.filter(
    (activity) => !hasGrade(student, activity.id)
  ).length;
}

function report(student, activities) {
  let weighted = 0;
  let done = 0;

  for (const activity of activities) {
    if (hasGrade(student, activity.id)) {
      const grade = student.grades[activity.id];

      weighted += grade * activity.weight / 100;
      done += activity.weight;
    }
  }

  return {
    average: done > 0 ? weighted * 100 / done : null,
    accrued: weighted,
    done,
  };
}

// ============================================
// RENDERIZADO GENERAL
// ============================================

function render() {
  const course = selected();
  const courseSelect = $("#curso-actual");

  courseSelect.replaceChildren();

  if (state.courses.length === 0) {
    courseSelect.add(
      new Option("No hay cursos — crea uno", "")
    );
  } else {
    for (const item of state.courses) {
      courseSelect.add(new Option(item.name, item.id));
    }
  }

  if (course) courseSelect.value = course.id;

  const active = Boolean(course);

  const controls = [
    "#form-estudiante input",
    "#form-estudiante button",
    "#form-actividad input",
    "#form-actividad button",
    "#buscar-estudiante",
    "#filtrar-estudiantes",
    "#exportar",
    "#renombrar-curso",
    "#eliminar-curso",
  ];

  for (const selector of controls) {
    document.querySelectorAll(selector).forEach((el) => {
      el.disabled = !active;
    });
  }

  const students = course?.students || [];
  const activities = course?.activities || [];

  $("#total-estudiantes").textContent = students.length;
  $("#total-actividades").textContent = activities.length;

  const totalWeight = course ? weights(course) : 0;

  $("#peso-total").textContent = `${format(totalWeight)}%`;

  $("#peso-restante").textContent =
    `Pendiente de configurar: ${format(Math.max(0, 100 - totalWeight))}%`;

  $("#peso-barra").style.width = `${Math.min(100, totalWeight)}%`;

  const averages = students
    .map((student) => report(student, activities).average)
    .filter((average) => average !== null);

  $("#promedio-grupo").textContent = averages.length
    ? format(
        averages.reduce((sum, grade) => sum + grade, 0)
        / averages.length
      )
    : "—";

  renderTable(course);
  renderActivities(course);
}

// ============================================
// TABLA DE CALIFICACIONES
// ============================================

function renderTable(course) {
  const head = $("#encabezado-tabla");
  const body = $("#cuerpo-tabla");

  head.replaceChildren();
  body.replaceChildren();

  const activities = course?.activities || [];

  const headerRow = element("tr");

  const columns = [
    "Estudiante",
    "Código",
    ...activities.map(
      (a) => `${a.name} (${format(a.weight)}%)`
    ),
    "Promedio",
    "Acumulado",
    "Estado",
    "Acciones",
  ];

  columns.forEach((title) => {
    headerRow.append(element("th", title));
  });

  head.append(headerRow);

  const query = $("#buscar-estudiante")
    .value.trim().toLowerCase();

  const filter = $("#filtrar-estudiantes").value;

  const students = (course?.students || [])
    .filter((student) =>
      `${student.name} ${student.code}`
        .toLowerCase()
        .includes(query)
    )
    .filter((student) => {
      const pending = pendingCount(student, activities);

      if (filter === "pendientes") return pending > 0;

      if (filter === "completos") {
        return activities.length > 0 && pending === 0;
      }

      return true;
    });

  if (!students.length) {
    const row = element("tr");
    const cell = element(
      "td",
      course
        ? "Sin estudiantes para mostrar."
        : "Crea un curso para comenzar.",
      "empty"
    );

    cell.colSpan = activities.length + 6;
    row.append(cell);
    body.append(row);
    return;
  }

  for (const student of students) {
    const row = element("tr");

    row.append(element("td", student.name));
    row.append(element("td", student.code));

    for (const activity of activities) {
      const cell = element("td");
      const input = element("input");

      input.type = "number";
      input.min = "0";
      input.max = "5";
      input.step = "0.01";
      input.placeholder = "—";
      input.className = "grade-input";

      input.setAttribute(
        "aria-label",
        `Nota de ${student.name} en ${activity.name}`
      );

      input.value = student.grades[activity.id] ?? "";

      input.classList.add(
        hasGrade(student, activity.id)
          ? "has-grade"
          : "pending"
      );

      input.addEventListener("change", () => {
        const value = input.value.trim().replace(",", ".");

        if (value === "") {
          delete student.grades[activity.id];
          save();
          render();
          return;
        }

        const grade = Number(value);

        if (
          !Number.isFinite(grade) ||
          grade < 0 ||
          grade > MAX
        ) {
          notify("La nota debe estar entre 0 y 5.");
          render();
          return;
        }

        student.grades[activity.id] = grade;

        save();
        render();
        notify(`Nota de ${student.name} actualizada.`);
      });

      cell.append(input);
      row.append(cell);
    }

    const result = report(student, activities);

    row.append(
      element(
        "td",
        result.average === null
          ? "—"
          : format(result.average),
        "score"
      )
    );

    row.append(
      element("td", format(result.accrued), "score")
    );

    const missing = pendingCount(student, activities);

    const statusCell = element("td");

    const statusText = activities.length === 0
      ? "Sin evaluaciones"
      : missing === 0
        ? "Completo"
        : `${missing} pendiente${missing !== 1 ? "s" : ""}`;

    statusCell.append(
      element(
        "span",
        statusText,
        `tag ${activities.length > 0 && missing === 0
          ? "complete"
          : "pending"}`
      )
    );

    row.append(statusCell);

    const actionsCell = element("td");
    const deleteButton = element(
      "button",
      "Eliminar",
      "button danger"
    );

    deleteButton.type = "button";

    deleteButton.addEventListener("click", () => {
      if (!confirm(`¿Eliminar a ${student.name} y sus notas?`)) {
        return;
      }

      course.students = course.students.filter(
        (item) => item.id !== student.id
      );

      save();
      render();
      notify("Estudiante eliminado.");
    });

    actionsCell.append(deleteButton);
    row.append(actionsCell);

    body.append(row);
  }
}

// ============================================
// ACTIVIDADES
// ============================================

function renderActivities(course) {
  const list = $("#lista-actividades");
  list.replaceChildren();

  if (!course || !course.activities.length) {
    list.append(
      element("p", "Aún no hay actividades creadas.", "muted")
    );
    return;
  }

  for (const activity of course.activities) {
    const item = element("div", undefined, "activity-item");
    const info = element("div", undefined, "activity-info");

    info.append(element("span", activity.name));

    const registered = course.students.filter(
      (student) => hasGrade(student, activity.id)
    ).length;

    info.append(
      element(
        "small",
        `${registered} de ${course.students.length} calificados`
      )
    );

    item.append(info);

    item.append(
      element("strong", `${format(activity.weight)}%`)
    );

    const remove = element(
      "button",
      "Eliminar",
      "button danger"
    );

    remove.type = "button";

    remove.addEventListener("click", () => {
      if (!confirm(`¿Eliminar la actividad "${activity.name}"?`)) {
        return;
      }

      course.activities = course.activities.filter(
        (a) => a.id !== activity.id
      );

      for (const student of course.students) {
        delete student.grades[activity.id];
      }

      save();
      render();
      notify("Actividad eliminada.");
    });

    item.append(remove);
    list.append(item);
  }
}

// ============================================
// CREAR CURSOS
// ============================================

$("#form-curso").addEventListener("submit", (event) => {
  event.preventDefault();

  const input = $("#nuevo-curso");
  const name = input.value.trim();

  if (!name) return;

  const exists = state.courses.some(
    (course) => course.name.toLowerCase() === name.toLowerCase()
  );

  if (exists) {
    notify("Ya existe un curso con ese nombre.");
    return;
  }

  const course = {
    id: uid(),
    name,
    students: [],
    activities: [],
  };

  state.courses.push(course);
  state.current = course.id;

  input.value = "";

  save();
  render();
  notify("Curso creado.");
});

// ============================================
// CAMBIAR, RENOMBRAR Y ELIMINAR CURSOS
// ============================================

$("#curso-actual").addEventListener("change", (event) => {
  state.current = event.target.value;
  save();
  render();
});

$("#renombrar-curso").addEventListener("click", () => {
  const course = selected();
  if (!course) return;

  const input = prompt("Nuevo nombre del curso:", course.name);
  if (input === null) return;

  const name = input.trim();

  if (!name) {
    notify("El nombre no puede estar vacío.");
    return;
  }

  const exists = state.courses.some(
    (other) =>
      other.id !== course.id &&
      other.name.toLowerCase() === name.toLowerCase()
  );

  if (exists) {
    notify("Ya existe otro curso con ese nombre.");
    return;
  }

  course.name = name;
  save();
  render();
  notify("Curso renombrado.");
});

$("#eliminar-curso").addEventListener("click", () => {
  const course = selected();
  if (!course) return;

  const confirmed = confirm(
    `¿Eliminar "${course.name}" y todas sus calificaciones?`
  );

  if (!confirmed) return;

  state.courses = state.courses.filter(
    (item) => item.id !== course.id
  );

  state.current = state.courses[0]?.id || null;

  save();
  render();
  notify("Curso eliminado.");
});

// ============================================
// REGISTRAR ESTUDIANTES
// ============================================

$("#form-estudiante").addEventListener("submit", (event) => {
  event.preventDefault();

  const course = selected();
  if (!course) return;

  const name = $("#nombre-estudiante").value.trim();
  const code = $("#codigo-estudiante").value.trim();

  if (!name || !code) return;

  const exists = course.students.some(
    (student) => student.code.toLowerCase() === code.toLowerCase()
  );

  if (exists) {
    notify("Ese código ya está registrado.");
    return;
  }

  course.students.push({
    id: uid(),
    name,
    code,
    grades: {},
  });

  event.target.reset();

  save();
  render();
  notify("Estudiante agregado.");
});

// ============================================
// CREAR EVALUACIONES
// ============================================

$("#form-actividad").addEventListener("submit", (event) => {
  event.preventDefault();

  const course = selected();
  if (!course) return;

  const name = $("#nombre-actividad").value.trim();
  const weight = Number($("#peso-actividad").value);

  if (
    !name ||
    !Number.isFinite(weight) ||
    weight <= 0 ||
    weight > 100
  ) {
    notify("Ingresa una actividad y un porcentaje válido.");
    return;
  }

  if (weights(course) + weight > 100 + 1e-8) {
    notify("Los porcentajes no pueden superar el 100%.");
    return;
  }

  const exists = course.activities.some(
    (activity) =>
      activity.name.toLowerCase() === name.toLowerCase()
  );

  if (exists) {
    notify("Ya existe una evaluación con ese nombre.");
    return;
  }

  course.activities.push({
    id: uid(),
    name,
    weight,
  });

  event.target.reset();

  save();
  render();
  notify("Evaluación creada.");
});

// ============================================
// FILTROS
// ============================================

$("#buscar-estudiante").addEventListener("input", () => {
  renderTable(selected());
});

$("#filtrar-estudiantes").addEventListener("change", () => {
  renderTable(selected());
});

// ============================================
// EXPORTAR CALIFICACIONES A CSV
// ============================================

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;

  document.body.append(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$("#exportar").addEventListener("click", () => {
  const course = selected();
  if (!course) return;

  const headers = [
    "Estudiante",
    "Código",
    ...course.activities.map(
      (a) => `${a.name} (${format(a.weight)}%)`
    ),
    "Promedio evaluado",
    "Acumulado definitivo",
  ];

  const rows = course.students.map((student) => {
    const result = report(student, course.activities);

    return [
      student.name,
      student.code,
      ...course.activities.map(
        (activity) => student.grades[activity.id] ?? ""
      ),
      result.average === null ? "" : format(result.average),
      format(result.accrued),
    ];
  });

  const csv = "\uFEFF" +
    [headers, ...rows]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n");

  downloadFile(
    `notas-${course.name.replace(/[^a-z0-9]/gi, "-")}.csv`,
    csv,
    "text/csv;charset=utf-8;"
  );

  notify("Calificaciones exportadas.");
});

// ============================================
// COPIAS DE SEGURIDAD JSON
// ============================================

$("#descargar-respaldo").addEventListener("click", () => {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    courses: state.courses,
    current: state.current,
  };

  downloadFile(
    `gestor-notas-respaldo-${new Date().toISOString().slice(0,10)}.json`,
    JSON.stringify(backup, null, 2),
    "application/json"
  );

  notify("Copia de seguridad descargada.");
});

$("#importar-respaldo").addEventListener("click", () => {
  $("#archivo-respaldo").click();
});

function validBackup(data) {
  if (!data || !Array.isArray(data.courses) ||
      data.courses.length > 1000) {
    return false;
  }

  const courseIds = new Set();

  for (const course of data.courses) {
    if (!course ||
        typeof course.id !== "string" ||
        typeof course.name !== "string" ||
        !course.name.trim() ||
        courseIds.has(course.id) ||
        !Array.isArray(course.students) ||
        !Array.isArray(course.activities) ||
        course.students.length > 10000 ||
        course.activities.length > 500) {
      return false;
    }

    courseIds.add(course.id);

    const activityIds = new Set();
    let totalWeight = 0;

    for (const activity of course.activities) {
      if (!activity ||
          typeof activity.id !== "string" ||
          typeof activity.name !== "string" ||
          !activity.name.trim() ||
          activityIds.has(activity.id) ||
          typeof activity.weight !== "number" ||
          !Number.isFinite(activity.weight) ||
          activity.weight <= 0 ||
          activity.weight > 100) {
        return false;
      }

      activityIds.add(activity.id);
      totalWeight += activity.weight;
    }

    if (totalWeight > 100.000001) return false;

    const studentIds = new Set();

    for (const student of course.students) {
      if (!student ||
          typeof student.id !== "string" ||
          studentIds.has(student.id) ||
          typeof student.name !== "string" ||
          !student.name.trim() ||
          typeof student.code !== "string" ||
          !student.code.trim() ||
          !student.grades ||
          typeof student.grades !== "object" ||
          Array.isArray(student.grades)) {
        return false;
      }

      studentIds.add(student.id);

      for (const [id, grade] of Object.entries(student.grades)) {
        if (!activityIds.has(id) ||
            typeof grade !== "number" ||
            !Number.isFinite(grade) ||
            grade < 0 ||
            grade > MAX) {
          return false;
        }
      }
    }
  }

  return true;
}

$("#archivo-respaldo").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";

  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    notify("El archivo supera el límite de 5 MB.");
    return;
  }

  try {
    const backup = JSON.parse(await file.text());

    if (!validBackup(backup)) {
      notify("El archivo no tiene un formato válido.");
      return;
    }

    const confirmed = confirm(
      "¿Restaurar la copia? Esto reemplazará los datos actuales."
    );

    if (!confirmed) return;

    const previous = state;

    state = {
      courses: backup.courses,
      current: backup.courses.some(
        (course) => course.id === backup.current
      )
        ? backup.current
        : backup.courses[0]?.id || null,
    };

    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      state = previous;
      notify("No hay espacio disponible para restaurar la copia.");
      return;
    }

    render();
    notify("Copia restaurada correctamente.");

  } catch (error) {
    notify("No se pudo leer el archivo JSON.");
    console.error(error);
  }
});

// ============================================
// INICIALIZACIÓN
// ============================================

if (state.courses.length && !selected()) {
  state.current = state.courses[0].id;
}

render();
