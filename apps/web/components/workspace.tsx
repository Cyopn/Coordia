'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import Link from 'next/link';

type Organization = { id: string; name: string };
type Project = { id: string; name: string; status: string };
type Label = { id: string; name: string; color: string | null };
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  parentTask: { id: string; title: string } | null;
  labels: { label: Label }[];
  dependencies: { dependsOn: { id: string; title: string; status: string } }[];
  _count: { subtasks: number; dependents: number };
};
type TaskResponse = {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const statuses = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];
const priorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export function Workspace() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [labels, setLabels] = useState<Label[]>([]);
  const [tasks, setTasks] = useState<TaskResponse | null>(null);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [createParentTaskId, setCreateParentTaskId] = useState('');
  const [createLabelIds, setCreateLabelIds] = useState<string[]>([]);
  const [createDependsOnIds, setCreateDependsOnIds] = useState<string[]>([]);
  const [newLabelName, setNewLabelName] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('TODO');
  const [editPriority, setEditPriority] = useState('MEDIUM');
  const [editDueAt, setEditDueAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadOrganizations();
  }, []);

  useEffect(() => {
    if (organizationId) void loadProjects(organizationId);
  }, [organizationId]);

  useEffect(() => {
    if (organizationId && projectId) void loadTasks();
  }, [organizationId, projectId, status, priority, search]);

  useEffect(() => {
    if (organizationId) void loadLabels(organizationId);
  }, [organizationId]);

  async function loadOrganizations() {
    try {
      const result = await apiRequest<Organization[]>('/organizations');
      setOrganizations(result);
      setOrganizationId(result[0]?.id ?? '');
    } catch (requestError) {
      setError(getError(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function loadProjects(id: string) {
    try {
      const result = await apiRequest<Project[]>(`/organizations/${id}/projects`);
      setProjects(result);
      setProjectId(result[0]?.id ?? '');
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  async function loadTasks() {
    try {
      const params = new URLSearchParams({ page: '1', pageSize: '25' });
      if (status) params.set('status', status);
      if (priority) params.set('priority', priority);
      if (search.trim()) params.set('search', search.trim());
      const result = await apiRequest<TaskResponse>(
        `/organizations/${organizationId}/projects/${projectId}/tasks?${params.toString()}`,
      );
      setTasks(result);
    } catch (requestError) {
      setError(getError(requestError));
    }

  }

  async function loadLabels(id: string) {
    try {
      setLabels(await apiRequest<Label[]>(`/organizations/${id}/labels`));
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await apiRequest(`/organizations/${organizationId}/projects/${projectId}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          title,
          parentTaskId: createParentTaskId || undefined,
          labelIds: createLabelIds,
          dependsOnIds: createDependsOnIds,
        }),
      });
      setTitle('');
      setCreateParentTaskId('');
      setCreateLabelIds([]);
      setCreateDependsOnIds([]);
      setMessage('Tarea creada correctamente.');
      await loadTasks();
    } catch (requestError) {
      setError(getError(requestError));
    }

  }

  async function createLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      await apiRequest(`/organizations/${organizationId}/labels`, {
        method: 'POST',
        body: JSON.stringify({ name: newLabelName }),
      });
      setNewLabelName('');
      setMessage('Etiqueta creada correctamente.');
      await loadLabels(organizationId);
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  function toggleSelection(
    value: string,
    selected: string[],
    setSelected: (values: string[]) => void,
  ) {
    setSelected(selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value]);
  }

  async function logout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }

  function beginEdit(task: Task) {
    setEditingTask(task);
    setEditDescription(task.description ?? '');
    setEditStatus(task.status);
    setEditPriority(task.priority);
    setEditDueAt(task.dueAt ? task.dueAt.slice(0, 10) : '');
    setError('');
    setMessage('');
  }

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingTask) return;
    setError('');
    setMessage('');
    try {
      await apiRequest(`/organizations/${organizationId}/projects/${projectId}/tasks/${editingTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editingTask.title,
          description: editDescription || undefined,
          status: editStatus,
          priority: editPriority,
          dueAt: editDueAt ? new Date(`${editDueAt}T23:59:59.000Z`).toISOString() : undefined,
        }),
      });
      setEditingTask(null);
      setMessage('Tarea actualizada correctamente.');
      await loadTasks();
    } catch (requestError) {
      setError(getError(requestError));
    }
  }

  if (loading) return <main><p>Cargando espacio de trabajo...</p></main>;

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <Link href="/security">Seguridad de la cuenta</Link>
        <div>
          <p className="eyebrow">Coordia / Espacio de trabajo</p>
          <h1>Trabajo del equipo</h1>
          <p>Consulta y organiza las tareas de tus proyectos.</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => void logout()}>
          Cerrar sesión
        </button>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="workspace-toolbar" aria-label="Contexto de trabajo">
        <label>
          Organización
          <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
        </label>
        <label>
          Proyecto
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
        </label>
      </section>

      <section className="task-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Tareas</p>
            <h2>{tasks?.total ?? 0} resultados</h2>
          </div>
          <form className="task-create-form" onSubmit={createTask}>
            <label htmlFor="task-title">Nueva tarea</label>
            <div className="inline-form">
              <input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} maxLength={240} placeholder="¿Qué hay que hacer?" />
              <button type="submit">Crear</button>
            </div>
            <div className="task-options">
              <label>Tarea padre
                <select value={createParentTaskId} onChange={(event) => setCreateParentTaskId(event.target.value)}>
                  <option value="">Ninguna</option>
                  {tasks?.items.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
              </label>
              <fieldset>
                <legend>Etiquetas</legend>
                {labels.map((label) => (
                  <label className="checkbox-label" key={label.id}>
                    <input type="checkbox" checked={createLabelIds.includes(label.id)} onChange={() => toggleSelection(label.id, createLabelIds, setCreateLabelIds)} />
                    {label.name}
                  </label>
                ))}
              </fieldset>
              <label>Depende de
                <select multiple value={createDependsOnIds} onChange={(event) => setCreateDependsOnIds(Array.from(event.target.selectedOptions, (option) => option.value))}>
                  {tasks?.items.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select>
              </label>
            </div>
          </form>
        </div>
        <form className="label-form" onSubmit={createLabel}>
          <label htmlFor="label-name">Nueva etiqueta</label>
          <div className="inline-form">
            <input id="label-name" value={newLabelName} onChange={(event) => setNewLabelName(event.target.value)} required maxLength={80} placeholder="Ej. Diseño" />
            <button type="submit">Añadir etiqueta</button>
          </div>
        </form>
        <div className="filters">
          <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Prioridad<select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas</option>{priorities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Buscar<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título o descripción" /></label>
        </div>
        {message && <p role="status">{message}</p>}
        {editingTask && (
          <form className="task-editor" onSubmit={saveTask}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Editar tarea</p>
                <h2>{editingTask.title}</h2>
              </div>
              <button type="button" className="secondary-button" onClick={() => setEditingTask(null)}>
                Cancelar
              </button>
            </div>
            <label htmlFor="task-description">Descripción</label>
            <textarea id="task-description" value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={4000} rows={4} />
            <div className="editor-grid">
              <label>Estado<select value={editStatus} onChange={(event) => setEditStatus(event.target.value)}>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Prioridad<select value={editPriority} onChange={(event) => setEditPriority(event.target.value)}>{priorities.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Fecha límite<input type="date" value={editDueAt} onChange={(event) => setEditDueAt(event.target.value)} /></label>
            </div>
            <button type="submit">Guardar cambios</button>
          </form>
        )}
        <div className="task-list">
          {tasks?.items.map((task) => (
            <article className="task-card" key={task.id}>
              <div>
                <h3>{task.title}</h3>
                {task.description && <p>{task.description}</p>}
                <div className="task-tags">
                  {task.parentTask && <span>Subtarea de: {task.parentTask.title}</span>}
                  {task.labels.map(({ label }) => <span key={label.id}>{label.name}</span>)}
                  {task.dependencies.length > 0 && <span>Depende de {task.dependencies.length}</span>}
                  {task._count.subtasks > 0 && <span>{task._count.subtasks} subtareas</span>}
                </div>
              </div>
              <div className="task-actions">
                <div className="task-meta"><span>{task.status}</span><span>{task.priority}</span>{task.dueAt && <span>Vence {new Date(task.dueAt).toLocaleDateString('es-MX')}</span>}</div>
                <button type="button" className="secondary-button" onClick={() => beginEdit(task)}>Editar</button>
              </div>
            </article>
          ))}
          {tasks?.items.length === 0 && <p>No hay tareas con estos filtros.</p>}
        </div>
      </section>
    </main>
  );
}

function getError(error: unknown): string {
  return error instanceof Error ? error.message : 'No se pudo completar la operación';
}
