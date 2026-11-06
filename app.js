
"use strict";

// ==========================================
// CONFIGURACIÓN Y ALMACENAMIENTO
// ==========================================

const KEY = "gestor-notas-docente-v1";
const MAX = 5;

const $ = (selector) => document.querySelector(selector);

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const format = (n) =>
  n.toLocaleString("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fresh = () => ({
  current: null,
  courses: [],
});

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));

    if (data && Array.isArray(data.courses)) {
      return data;
    }
  } catch {}

  return fresh();
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    notify("No se pudieron guardar los cambios.");
  }
}

function notify(message) {
  $("#mensaje").textContent = message;
}

// ==========================================
// CURSOS Y CÁLCULOS
// ==========================================

function selected() {
  return state.courses.find(
    (course) => course.id === state.current
  ) || null;
}

function weights(course) {
  return course.activities.reduce(
    (sum, activity) => sum + activity.weight,
    0
  );
}

function report(student, activities) {
  let weighted = 0;
  let done = 0;

  for (const activity of activities) {
    const grade = student.grades[activity.id];

    if (
      typeof grade === "number" &&
      Number.isFinite(grade)
    ) {
      weighted += grade * activity.weight / 100;
      done += activity.weight;
    }
  }

  return {
    average: done > 0
      ? weighted * 100 / done
      : null,
    accrued: weighted,
    done,
  };
}

// ==========================================
// ELEMENTOS HTML
// ==========================================

function element(tag, text, className) {
  const el = document.createElement(tag);

  if (text !== undefined) {
    el.textContent = text;
  }

  if (className) {
    el.className = className;
  }

  return el;
}

// ==========================================
// RENDERIZADO GENERAL
// ==========================================

function render() {
  const course = selected();
  const select = $("#curso-actual");

  select.replaceChildren();

  if (!state.courses.length) {
    select.add(
      new Option("No hay cursos — crea uno", "")
    );
  } else {
    for (const c of state.courses) {
      select.add(new Option(c.name, c.id));
    }
  }

  if (course) {
    select.value = course.id;
  }

  const active = Boolean(course);

  const controls = [
    "#form-estudiante input",
    "#form-estudiante button",
    "#form-actividad input",
    "#form-actividad button",
    "#buscar-estudiante",
    "#exportar",
  ];

  for (const selector of controls) {
    document.querySelectorAll(selector).forEach(
      (el) => el.disabled = !active
    );
  }

  const students = course?.students || [];
  const activities = course?.activities || [];

  $("#total-estudiantes").textContent =
    students.length;

  $("#total-actividades").textContent =
    activities.length;

  $("#peso-total").textContent =
    `${format(course ? weights(course) : 0)}%`;

  const averages = students
    .map((student) => report(student, activities).average)
    .filter((grade) => grade !== null);

  $("#promedio-grupo").textContent =
    averages.length
      ? format(
          averages.reduce((sum, grade) => sum + grade, 0)
          / averages.length
        )
      : "—";

  renderTable(course);
  renderActivities(course);
}

// ==========================================
// TABLA DE ESTUDIANTES Y NOTAS
// ==========================================

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
    "Acciones",
  ];

  columns.forEach((title) => {
    headerRow.append(element("th", title));
  });

  head.append(headerRow);

  const query = $("#buscar-estudiante")
    .value.trim()
    .toLocaleLowerCase("es");

  const students = (course?.students || []).filter(
    (student) =>
      `${student.name} ${student.code}`
        .toLocaleLowerCase("es")
        .includes(query)
  );

  if (!students.length) {
    const tr = element("tr");

    const td = element(
      "td",
      course
        ? "Sin estudiantes para mostrar."
        : "Crea un curso para comenzar.",
      "empty"
    );

    td.colSpan = activities.length + 5;
    tr.append(td);
    body.append(tr);

    return;
  }

  for (const student of students) {
    const tr = element("tr");

    tr.append(element("td", student.name));
    tr.append(element("td", student.code));

    for (const activity of activities) {
      const td = element("td");
      const input = element("input");

      input.className = "grade-input";
      input.type = "number";
      input.min = "0";
      input.max = "5";
      input.step = "0.01";
      input.placeholder = "—";

      input.setAttribute(
        "aria-label",
        `Nota de ${student.name} en ${activity.name}`
      );

      input.value =
        student.grades[activity.id] ?? "";

      input.addEventListener("change", () => {
        const value = input.value
          .trim()
          .replace(",", ".");

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

        notify(
          `Nota de ${student.name} actualizada.`
        );
      });

      td.append(input);
      tr.append(td);
    }

    const result = report(student, activities);

    tr.append(
      element(
        "td",
        result.average === null
          ? "—"
          : format(result.average)
      )
    );

    tr.append(
      element("td", format(result.accrued))
    );

    const td = element("td");

    const button = element(
      "button",
      "Eliminar",
      "button danger"
    );

    button.type = "button";

    button.setAttribute(
      "aria-label",
      `Eliminar estudiante ${student.name}`
    );

    button.addEventListener("click", () => {
      if (
        !confirm(
          `¿Eliminar a ${student.name} y sus notas?`
        )
      ) {
        return;
      }

      course.students = course.students.filter(
        (s) => s.id !== student.id
      );

      save();
      render();

      notify("Estudiante eliminado.");
    });

    td.append(button);
    tr.append(td);

    body.append(tr);
  }
}

// ==========================================
// LISTA DE ACTIVIDADES
// ==========================================

function renderActivities(course) {
  const list = $("#lista-actividades");

  list.replaceChildren();

  if (!course || !course.activities.length) {
    list.append(
      element(
        "p",
        "Aún no hay actividades creadas.",
        "muted"
      )
    );
    return;
  }

  for (const activity of course.activities) {
    const item = element(
      "div",
      undefined,
      "activity-item"
    );

    item.append(element("span", activity.name));

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
      if (
        !confirm(
          `¿Eliminar la actividad «${activity.name}» y todas sus notas?`
        )
      ) {
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

// ==========================================
// CREAR CURSOS
// ==========================================

$("#form-curso").addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    const input = $("#nuevo-curso");
    const name = input.value.trim();

    if (!name) return;

    const exists = state.courses.some(
      (course) =>
        course.name.toLocaleLowerCase("es") ===
        name.toLocaleLowerCase("es")
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
  }
);

// ==========================================
// CAMBIAR CURSO
// ==========================================

$("#curso-actual").addEventListener(
  "change",
  (event) => {
    state.current = event.target.value;

    save();
    render();
  }
);

// ==========================================
// AGREGAR ESTUDIANTES
// ==========================================

$("#form-estudiante").addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    const course = selected();

    if (!course) return;

    const name = $("#nombre-estudiante")
      .value.trim();

    const code = $("#codigo-estudiante")
      .value.trim();

    if (!name || !code) return;

    const exists = course.students.some(
      (student) =>
        student.code.toLocaleLowerCase("es") ===
        code.toLocaleLowerCase("es")
    );

    if (exists) {
      notify(
        "Ese código ya está registrado en el curso."
      );
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
  }
);

// ==========================================
// CREAR ACTIVIDADES
// ==========================================

$("#form-actividad").addEventListener(
  "submit",
  (event) => {
    event.preventDefault();

    const course = selected();

    if (!course) return;

    const name = $("#nombre-actividad")
      .value.trim();

    const weight = Number(
      $("#peso-actividad").value
    );

    if (
      !name ||
      !Number.isFinite(weight) ||
      weight <= 0 ||
      weight > 100
    ) {
      notify(
        "Ingresa un nombre y un porcentaje válido."
      );
      return;
    }

    if (weights(course) + weight > 100 + 1e-8) {
      notify(
        "Los porcentajes no pueden superar el 100%."
      );
      return;
    }

    const exists = course.activities.some(
      (activity) =>
        activity.name.toLocaleLowerCase("es") ===
        name.toLocaleLowerCase("es")
    );

    if (exists) {
      notify(
        "Ya hay una actividad con ese nombre."
      );
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

    notify("Actividad creada.");
  }
);

// ==========================================
// BUSCAR ESTUDIANTES
// ==========================================

$("#buscar-estudiante").addEventListener(
  "input",
  () => renderTable(selected())
);

// ==========================================
// EXPORTACIÓN A CSV
// ==========================================

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

$("#exportar").addEventListener("click", () => {
  const course = selected();

  if (!course) return;

  const columns = [
    "Estudiante",
    "Código",
    ...course.activities.map(
      (a) => `${a.name} (${format(a.weight)}%)`
    ),
    "Promedio evaluado",
    "Acumulado definitivo",
  ];

  const rows = course.students.map((student) => {
    const result = report(
      student,
      course.activities
    );

    return [
      student.name,
      student.code,
      ...course.activities.map(
        (activity) =>
          student.grades[activity.id] ?? ""
      ),
      result.average === null
        ? ""
        : format(result.average),
      format(result.accrued),
    ];
  });

  const csv =
    "\uFEFF" +
    [columns, ...rows]
      .map(
        (row) =>
          row.map(csvCell).join(";")
      )
      .join("\r\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });

  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");

  link.href = url;

  link.download =
    `notas-${course.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")}.csv`;

  document.body.append(link);

  link.click();
  link.remove();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );

  notify("Archivo CSV exportado.");
});

// ==========================================
// INICIALIZACIÓN
// ==========================================

if (state.courses.length && !selected()) {
  state.current = state.courses[0].id;
}

render();
