import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import AddRounded from '@mui/icons-material/AddRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import FolderOpenRounded from '@mui/icons-material/FolderOpenRounded';
import FolderRounded from '@mui/icons-material/FolderRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import PsychologyRounded from '@mui/icons-material/PsychologyRounded';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import SecurityRounded from '@mui/icons-material/SecurityRounded';
import StopRounded from '@mui/icons-material/StopRounded';
import TerminalRounded from '@mui/icons-material/TerminalRounded';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CssBaseline from '@mui/material/CssBaseline';
import Divider from '@mui/material/Divider';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import ListItemText from '@mui/material/ListItemText';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { alpha, createTheme, ThemeProvider } from '@mui/material/styles';
import { abortTask, addFolder, getModels, getState, pickFolder, rescanFolder, resolvePermission, startTask } from './api';
import { applyServerEventToState, emptyClientState, queryKeys, type ClientState } from './queryCache';
import { formatTimelineEvent, type TimelineKind, type TimelinePresentation, type TimelineTone } from './timeline';
import type { AgentTask, FolderRecord, GitHubCopilotAsset, PendingPermission, PermissionDecision, ServerEvent } from '../shared/types';

type TimelineRow = {
  id: string;
  taskId: string;
  type: string;
  presentation: TimelinePresentation;
  createdAt: string;
};

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#3451d1',
      dark: '#253a91',
      light: '#6f82df',
    },
    success: {
      main: '#16a34a',
    },
    warning: {
      main: '#b45309',
    },
    info: {
      main: '#0ea5e9',
      dark: '#0369a1',
    },
    background: {
      default: '#f4f6fa',
      paper: '#fbfcff',
    },
    text: {
      primary: '#151a2d',
      secondary: '#626b80',
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'system-ui', 'sans-serif'].join(','),
    fontSize: 14,
    h5: { fontWeight: 780, letterSpacing: 0, fontSize: 21 },
    h6: { fontWeight: 780, letterSpacing: 0, fontSize: 17 },
    subtitle1: { fontWeight: 760, letterSpacing: 0, fontSize: 15 },
    body1: { fontSize: 14, lineHeight: 1.45 },
    body2: { fontSize: 13, lineHeight: 1.45 },
    caption: { fontSize: 12, lineHeight: 1.35 },
    button: {
      textTransform: 'none',
      fontWeight: 720,
      fontSize: 13,
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          minHeight: 32,
        },
        contained: {
          boxShadow: '0 1px 2px rgba(21, 26, 45, 0.14)',
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 720,
          minHeight: 34,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 7,
          backgroundColor: '#fcfdff',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          fontWeight: 720,
        },
        sizeSmall: {
          height: 22,
          fontSize: 12,
        },
      },
    },
  },
});

const tokens = {
  ultramarine: '#3451d1',
  ultramarineDark: '#253a91',
  ultramarineSoft: '#edf1ff',
  ultramarineWash: '#f8faff',
  ink: '#151a2d',
  muted: '#626b80',
  faint: '#828ba0',
  line: '#d8dee9',
  lineStrong: '#c8d1e2',
  panel: '#fbfcff',
  panelSolid: '#ffffff',
  canvas: '#f4f6fa',
  recessed: '#eef2f7',
  successSoft: '#edf8f1',
  warningSurface: '#fff7ed',
  dangerSoft: '#fff1f2',
};
const eliAgentUrl = new URL('./assets/eli-agent.png', import.meta.url).href;
const eliBlueIdleUrl = new URL('./assets/eli-blue-idle.png', import.meta.url).href;
const eliBlueActiveUrl = new URL('./assets/eli-blue-active.png', import.meta.url).href;

export function App() {
  const queryClient = useQueryClient();
  const stateQuery = useQuery({
    queryKey: queryKeys.state,
    queryFn: getState,
    initialData: emptyClientState,
  });
  const modelsQuery = useQuery({
    queryKey: queryKeys.models,
    queryFn: getModels,
    retry: 1,
  });
  const [timeline, setTimeline] = useState<TimelineRow[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [folderPath, setFolderPath] = useState('~/Projects');
  const [prompt, setPrompt] = useState('Inspect this project and propose the smallest safe implementation plan.');
  const [mode, setMode] = useState<AgentTask['mode']>('plan');
  const [commandMode, setCommandMode] = useState<AgentTask['commandMode']>('enqueue');
  const [model, setModel] = useState('auto');
  const [reasoningEffort, setReasoningEffort] = useState<AgentTask['reasoningEffort']>('medium');
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedSkillIds, setSelectedSkillIds] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [error, setError] = useState<string>('');

  const folders = stateQuery.data.folders;
  const tasks = stateQuery.data.tasks;
  const permissions = stateQuery.data.permissions;
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? folders[0];
  const activeTask = tasks.find((task) => task.status === 'running') ?? tasks[0];
  const folderAgents = selectedFolder?.githubAssets.filter((asset) => asset.kind === 'agent') ?? [];
  const folderSkills = selectedFolder?.githubAssets.filter((asset) => asset.kind === 'skill') ?? [];
  const selectedTimeline = activeTask ? timeline.filter((row) => row.taskId === activeTask.id) : timeline;
  const selectedActivity = selectedTimeline.filter((row) => row.presentation.isUserFacing);
  const selectedModel = modelsQuery.data?.find((candidate) => candidate.id === model);
  const reasoningOptions = selectedModel?.supportedReasoningEfforts.length
    ? selectedModel.supportedReasoningEfforts
    : (['low', 'medium', 'high', 'xhigh'] as const);
  const addFolderMutation = useMutation({
    mutationFn: addFolder,
    onSuccess: (folder) => {
      mergeServerEvent({ type: 'folder.updated', data: folder });
      setSelectedFolderId(folder.id);
    },
  });
  const pickFolderMutation = useMutation({
    mutationFn: pickFolder,
    onSuccess: (folder) => {
      mergeServerEvent({ type: 'folder.updated', data: folder });
      setSelectedFolderId(folder.id);
      setFolderPath(folder.path);
    },
  });
  const rescanFolderMutation = useMutation({
    mutationFn: rescanFolder,
    onSuccess: (folder) => mergeServerEvent({ type: 'folder.updated', data: folder }),
  });
  const startTaskMutation = useMutation({
    mutationFn: startTask,
    onSuccess: (task) => mergeServerEvent({ type: 'task.updated', data: task }),
  });
  const abortTaskMutation = useMutation({
    mutationFn: abortTask,
    onSuccess: (task) => mergeServerEvent({ type: 'task.updated', data: task }),
  });
  const resolvePermissionMutation = useMutation({
    mutationFn: ({ permissionId, decision }: { permissionId: string; decision: PermissionDecision }) =>
      resolvePermission(permissionId, decision),
  });
  const busy =
    stateQuery.isFetching ||
    addFolderMutation.isPending ||
    pickFolderMutation.isPending ||
    rescanFolderMutation.isPending ||
    startTaskMutation.isPending ||
    abortTaskMutation.isPending ||
    resolvePermissionMutation.isPending;

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/api/events`);

    socket.addEventListener('open', () => setConnectionState('connected'));
    socket.addEventListener('close', () => setConnectionState('offline'));
    socket.addEventListener('error', () => setConnectionState('offline'));
    socket.addEventListener('message', (message) => {
      applyServerEvent(JSON.parse(message.data as string) as ServerEvent);
    });

    return () => socket.close();
  }, [queryClient]);

  useEffect(() => {
    if (!selectedFolderId && folders[0]) {
      setSelectedFolderId(folders[0].id);
    }
  }, [folders, selectedFolderId]);

  useEffect(() => {
    if (!selectedFolder) {
      setSelectedAgentId('');
      setSelectedSkillIds([]);
      return;
    }

    setSelectedAgentId((current) =>
      current && selectedFolder.githubAssets.some((asset) => asset.kind === 'agent' && asset.id === current) ? current : '',
    );
    setSelectedSkillIds((current) =>
      current.filter((skillId) => selectedFolder.githubAssets.some((asset) => asset.kind === 'skill' && asset.id === skillId)),
    );
  }, [selectedFolder]);

  useEffect(() => {
    if (!modelsQuery.data?.length) {
      return;
    }

    if (!modelsQuery.data.some((candidate) => candidate.id === model)) {
      const firstModel = modelsQuery.data[0];
      setModel(firstModel.id);
      setReasoningEffort(firstModel.defaultReasoningEffort ?? firstModel.supportedReasoningEfforts[0] ?? undefined);
    }
  }, [model, modelsQuery.data]);

  const projectFacts = useMemo(() => {
    if (!selectedFolder) {
      return [];
    }

    return [
      ['Path', selectedFolder.path],
      ['Git', selectedFolder.git.branch ? `${selectedFolder.git.branch}${selectedFolder.git.dirty ? ' dirty' : ''}` : 'No git repo'],
      ['Package', selectedFolder.packageManager ?? 'Not detected'],
      ['Scripts', selectedFolder.scripts.length ? selectedFolder.scripts.join(', ') : 'None'],
      ['Instructions', selectedFolder.instructionFiles.length ? selectedFolder.instructionFiles.join(', ') : 'None'],
      ['Project abilities', selectedFolder.githubAssets.length ? `${folderAgents.length} agents, ${folderSkills.length} skills` : 'None'],
    ];
  }, [folderAgents.length, folderSkills.length, selectedFolder]);

  const eliNeedsDecision = activeTask?.waitReason === 'approval';
  const eliIsRunning = activeTask?.phase === 'running';
  const eliIsActive = eliIsRunning || eliNeedsDecision;
  const activeStatusText = activeTask ? taskStatusText(activeTask) : 'No task selected';
  const currentActivityText = activeTask
    ? eliNeedsDecision
      ? 'Eli needs your decision before continuing.'
      : eliIsRunning
        ? 'Eli is working in the selected project.'
        : activeTask.phase === 'waiting'
          ? 'Eli is ready for the next instruction.'
          : activeTask.phase === 'terminal'
            ? 'This task has reached a terminal state.'
            : 'Eli is queued.'
    : 'Choose a workspace folder, then start a plan or run task.';

  function mergeServerEvent(event: ServerEvent): void {
    queryClient.setQueryData<ClientState>(queryKeys.state, (current) => applyServerEventToState(current, event));
  }

  function applyServerEvent(event: ServerEvent): void {
    if (event.type === 'snapshot') {
      mergeServerEvent(event);
      setSelectedFolderId((current) => current || event.data.folders[0]?.id || '');
      return;
    }

    if (event.type === 'folder.updated') {
      mergeServerEvent(event);
      setSelectedFolderId((current) => current || event.data.id);
      return;
    }

    if (event.type === 'task.updated' || event.type === 'permission.pending' || event.type === 'permission.resolved') {
      mergeServerEvent(event);
      return;
    }

    if (event.type === 'session.event') {
      const sessionEvent = event.data.event as { id?: string; type?: string; timestamp?: string; data?: unknown };
      const row: TimelineRow = {
        id: sessionEvent.id ?? crypto.randomUUID(),
        taskId: event.data.taskId,
        type: sessionEvent.type ?? 'session.event',
        presentation: formatTimelineEvent(sessionEvent),
        createdAt: sessionEvent.timestamp ?? new Date().toISOString(),
      };
      setTimeline((current) => [row, ...current].slice(0, 160));
    }
  }

  async function handleAddFolder() {
    setError('');

    try {
      await addFolderMutation.mutateAsync(folderPath);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to add folder');
    }
  }

  async function handlePickFolder() {
    setError('');

    try {
      await pickFolderMutation.mutateAsync();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to choose folder');
    }
  }

  async function handleRescanFolder(folder: FolderRecord) {
    setError('');

    try {
      await rescanFolderMutation.mutateAsync(folder.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to rescan folder');
    }
  }

  async function handleStartTask(nextMode = mode) {
    if (!selectedFolder) {
      setError('Add and select a folder first');
      return;
    }

    setError('');

    try {
      await startTaskMutation.mutateAsync({
        folderId: selectedFolder.id,
        prompt,
        mode: nextMode,
        commandMode,
        model,
        reasoningEffort: selectedModel?.supportsReasoningEffort === false ? undefined : reasoningEffort,
        selectedAgentId: selectedAgentId || undefined,
        selectedSkillIds,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to start task');
    }
  }

  async function handleAbortTask(task?: AgentTask) {
    if (!task) {
      return;
    }

    setError('');

    try {
      await abortTaskMutation.mutateAsync(task.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to abort task');
    }
  }

  async function handleResolvePermission(permission: PendingPermission, decision: PermissionDecision) {
    setError('');

    try {
      await resolvePermissionMutation.mutateAsync({ permissionId: permission.id, decision });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to resolve permission');
    }
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ height: '100vh', overflow: { xs: 'auto', lg: 'hidden' }, bgcolor: tokens.canvas, color: 'text.primary' }}>
        <Box
          component="header"
          sx={{
            height: 60,
            px: { xs: 1.5, md: 2.25 },
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderBottom: `1px solid ${alpha('#ffffff', 0.18)}`,
            bgcolor: '#1837f2',
            backgroundImage: 'linear-gradient(135deg, #122bf1 0%, #2446ff 48%, #142fdc 100%)',
            color: '#ffffff',
            boxShadow: '0 14px 30px rgba(37, 58, 145, 0.2)',
          }}
        >
          <Stack direction="row" spacing={1.2} sx={{ minWidth: 0, alignItems: 'center' }}>
            <EliMark active={eliIsActive} tone={eliNeedsDecision ? 'waiting' : 'active'} size={48} contrast="blue" />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h6" sx={{ lineHeight: 1.05, fontSize: 16, letterSpacing: 0 }}>
                Eli
              </Typography>
              <Typography variant="caption" sx={{ color: alpha('#ffffff', 0.74) }}>
                Agent workbench · Copilot SDK 0.3.0
              </Typography>
            </Box>
          </Stack>

          <Box sx={{ flex: 1 }} />

          <Chip
            size="small"
            label={connectionState}
            color={connectionState === 'connected' ? 'success' : connectionState === 'connecting' ? 'warning' : 'default'}
            variant="filled"
            sx={{
              bgcolor: connectionState === 'connected' ? '#e9fff1' : alpha('#ffffff', 0.18),
              color: connectionState === 'connected' ? '#0f8a3c' : '#ffffff',
              border: `1px solid ${connectionState === 'connected' ? alpha('#e9fff1', 0.72) : alpha('#ffffff', 0.26)}`,
              fontWeight: 850,
            }}
          />
        </Box>

        {busy && <LinearProgress sx={{ height: 2 }} />}

        <Box
          sx={{
            p: { xs: 1.25, md: 1.5 },
            height: { xs: 'auto', lg: 'calc(100vh - 60px)' },
            minHeight: { xs: 'calc(100vh - 60px)', lg: 0 },
            boxSizing: 'border-box',
            overflow: { xs: 'visible', lg: 'hidden' },
            display: 'grid',
            gap: { xs: 1.25, lg: 1.5 },
            gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0, 1fr) 300px' },
            alignItems: 'stretch',
            maxWidth: 1680,
            mx: 'auto',
          }}
        >
          <Panel title="Workspace" icon={<FolderRounded fontSize="small" />}>
            <Stack spacing={1}>
              <Button
                variant="outlined"
                color="inherit"
                startIcon={<FolderOpenRounded />}
                onClick={handlePickFolder}
                disabled={busy}
                fullWidth
                sx={{
                  justifyContent: 'flex-start',
                  borderColor: tokens.lineStrong,
                  color: tokens.ink,
                  bgcolor: tokens.panelSolid,
                  '&:hover': {
                    borderColor: alpha(tokens.ultramarine, 0.42),
                    bgcolor: tokens.ultramarineWash,
                  },
                }}
              >
                Choose folder
              </Button>

              <Stack direction="row" spacing={0.7}>
                <TextField
                  size="small"
                  value={folderPath}
                  onChange={(event) => setFolderPath(event.target.value)}
                  placeholder="Paste path as fallback"
                  slotProps={{ htmlInput: { 'aria-label': 'Paste path as fallback' } }}
                  fullWidth
                />
                <Tooltip title="Add pasted path">
                  <IconButton color="primary" onClick={handleAddFolder} disabled={busy}>
                    <AddRounded />
                  </IconButton>
                </Tooltip>
              </Stack>

              <Stack spacing={0.75}>
                {folders.length === 0 ? (
                  <EmptyState text="Choose a local project folder, or paste a path manually." />
                ) : (
                  folders.map((folder) => (
                    <FolderRow
                      key={folder.id}
                      folder={folder}
                      selected={folder.id === selectedFolder?.id}
                      onSelect={() => setSelectedFolderId(folder.id)}
                      onRescan={() => handleRescanFolder(folder)}
                    />
                  ))
                )}
              </Stack>

              <Divider />

              <SectionLabel icon={<AutoAwesomeRounded fontSize="small" />} text="Project abilities" />
              {selectedFolder ? (
                <Stack spacing={0.75}>
                  <FormControl size="small" fullWidth disabled={folderAgents.length === 0}>
                    <InputLabel id="agent-label">Agent</InputLabel>
                    <Select
                      labelId="agent-label"
                      label="Agent"
                      value={selectedAgentId}
                      onChange={(event) => setSelectedAgentId(event.target.value)}
                    >
                      <MenuItem value="">Default Copilot agent</MenuItem>
                      {folderAgents.map((asset) => (
                        <MenuItem key={asset.id} value={asset.id}>
                          {asset.title}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small" fullWidth disabled={folderSkills.length === 0}>
                    <InputLabel id="skills-label">Skills</InputLabel>
                    <Select
                      labelId="skills-label"
                      label="Skills"
                      multiple
                      value={selectedSkillIds}
                      onChange={(event) => {
                        const value = event.target.value;
                        setSelectedSkillIds(typeof value === 'string' ? value.split(',') : value);
                      }}
                      renderValue={(selected) =>
                        selected
                          .map((skillId) => folderSkills.find((asset) => asset.id === skillId)?.title ?? skillId)
                          .join(', ')
                      }
                    >
                      {folderSkills.map((asset) => (
                        <MenuItem key={asset.id} value={asset.id}>
                          <Checkbox checked={selectedSkillIds.includes(asset.id)} />
                          <ListItemText primary={asset.title} secondary={asset.path} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {selectedFolder.githubAssets.length === 0 ? (
                    <EmptyState text="No .github agents or skills found." />
                  ) : (
                    <Stack spacing={0.8}>
                      {selectedFolder.githubAssets.map((asset) => (
                        <AssetRow key={asset.id} asset={asset} />
                      ))}
                    </Stack>
                  )}
                </Stack>
              ) : (
                <EmptyState text="Select a folder." />
              )}
            </Stack>
          </Panel>

          <Panel title="Eli's Workbench" icon={<TerminalRounded fontSize="small" />} grow prominent>
            <Stack spacing={1} sx={{ height: '100%', minHeight: 0 }}>
              <Box
                sx={{
                  border: `1px solid ${tokens.line}`,
                  bgcolor: tokens.panelSolid,
                  borderRadius: 1,
                  p: 0.95,
                  boxShadow: 'none',
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={1}
                  sx={{
                    alignItems: { md: 'center' },
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  <EliMark active={eliIsActive} tone={eliNeedsDecision ? 'waiting' : 'active'} size={34} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body1" sx={{ color: tokens.ink, fontWeight: 760 }} noWrap>
                      {activeStatusText}
                    </Typography>
                    <Typography variant="body2" sx={{ color: tokens.muted, mt: 0.15 }}>
                      {currentActivityText}
                    </Typography>
                  </Box>
                  {activeTask && <TaskStateChip task={activeTask} />}
                </Stack>
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: '1.2fr 1fr 1fr 1fr' },
                  gap: 0.8,
                  alignItems: 'end',
                }}
              >
                <FormControl size="small" fullWidth error={modelsQuery.isError}>
                  <InputLabel id="model-label">Model</InputLabel>
                  <Select
                    labelId="model-label"
                    label="Model"
                    value={model}
                    onChange={(event) => {
                      const nextModelId = event.target.value;
                      const nextModel = modelsQuery.data?.find((candidate) => candidate.id === nextModelId);
                      setModel(nextModelId);
                      if (nextModel?.defaultReasoningEffort) {
                        setReasoningEffort(nextModel.defaultReasoningEffort);
                      } else if (nextModel?.supportedReasoningEfforts[0]) {
                        setReasoningEffort(nextModel.supportedReasoningEfforts[0]);
                      }
                    }}
                  >
                    {modelsQuery.data?.length ? (
                      modelsQuery.data.map((option) => (
                        <MenuItem key={option.id} value={option.id}>
                          {option.name || option.id}
                          {option.billingMultiplier ? ` · ${option.billingMultiplier}x` : ''}
                        </MenuItem>
                      ))
                    ) : (
                      <MenuItem value={model}>{modelsQuery.isLoading ? 'Loading models...' : model}</MenuItem>
                    )}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel id="reasoning-label">Thinking</InputLabel>
                  <Select
                    labelId="reasoning-label"
                    label="Thinking"
                    value={reasoningEffort ?? 'medium'}
                    disabled={selectedModel?.supportsReasoningEffort === false}
                    onChange={(event) => setReasoningEffort(event.target.value as AgentTask['reasoningEffort'])}
                  >
                    {reasoningOptions.map((option) => (
                      <MenuItem key={option} value={option}>
                        {option}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', mb: 0.45, color: tokens.faint, fontWeight: 780 }}>
                    Intent
                  </Typography>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    fullWidth
                    value={mode}
                    onChange={(_event, value: AgentTask['mode'] | null) => value && setMode(value)}
                  >
                    <ToggleButton value="plan" sx={{ flex: 1 }}>Plan</ToggleButton>
                    <ToggleButton value="run" sx={{ flex: 1 }}>Run</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                <Box>
                  <Typography variant="caption" sx={{ display: 'block', mb: 0.45, color: tokens.faint, fontWeight: 780 }}>
                    Timing
                  </Typography>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    fullWidth
                    value={commandMode}
                    onChange={(_event, value: AgentTask['commandMode'] | null) => value && setCommandMode(value)}
                  >
                    <ToggleButton value="enqueue" sx={{ flex: 1 }}>Next</ToggleButton>
                    <ToggleButton value="immediate" sx={{ flex: 1 }}>Now</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </Box>

              <Stack spacing={0.6}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', minWidth: 0 }}>
                  <Typography variant="caption" sx={{ color: tokens.faint, fontWeight: 800, textTransform: 'uppercase' }}>
                    Instruction
                  </Typography>
                  <Typography variant="caption" sx={{ color: tokens.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedFolder ? selectedFolder.path : 'Select a folder'}
                  </Typography>
                </Stack>
                <TextField
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  multiline
                  minRows={2}
                  fullWidth
                  sx={{
                    '& .MuiInputBase-root': {
                      alignItems: 'flex-start',
                      fontSize: 14,
                      lineHeight: 1.45,
                    },
                  }}
                />
              </Stack>

              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Button
                  variant="contained"
                  startIcon={<PlayArrowRounded />}
                  disabled={busy || !selectedFolder || !prompt.trim()}
                  onClick={() => handleStartTask(mode)}
                >
                  Start
                </Button>
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<StopRounded />}
                  disabled={!activeTask || activeTask.status !== 'running'}
                  onClick={() => handleAbortTask(activeTask)}
                >
                  Abort
                </Button>
                <Box sx={{ flex: 1 }} />
              </Stack>

              {error && (
                <Box sx={{ p: 1.2, borderRadius: 1, bgcolor: alpha(theme.palette.error.main, 0.08), color: 'error.dark' }}>
                  <Typography variant="body2">{error}</Typography>
                </Box>
              )}
              {modelsQuery.isError && (
                <Box sx={{ p: 1.2, borderRadius: 1, bgcolor: alpha(theme.palette.warning.main, 0.1), color: 'warning.dark' }}>
                  <Typography variant="body2">
                    Could not load Copilot models. Check GitHub Copilot authentication, then refresh.
                  </Typography>
                </Box>
              )}

              <Divider />

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', xl: '220px minmax(0,1fr)' },
                  gap: 1,
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <Stack spacing={0.8} sx={{ minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
                  <SectionLabel icon={<HistoryRounded fontSize="small" />} text="Requests" />
                  <Box sx={{ overflow: 'auto', pr: 0.4 }}>
                    {tasks.length === 0 ? (
                      <EmptyState text="No runs yet." />
                    ) : (
                      <Stack spacing={0.6}>
                        {tasks.map((task) => <TaskRow key={task.id} task={task} active={task.id === activeTask?.id} />)}
                      </Stack>
                    )}
                  </Box>
                </Stack>

                <Stack spacing={0.8} sx={{ minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <SectionLabel icon={<HistoryRounded fontSize="small" />} text="Eli's work" />
                    <Chip
                      size="small"
                      label={`${selectedActivity.length} steps`}
                      variant="outlined"
                      sx={{ height: 22, color: 'text.secondary' }}
                    />
                  </Stack>
                  <Box sx={{ overflow: 'auto', minHeight: 0, pr: 0.5 }}>
                    {selectedActivity.length === 0 ? (
                      <EmptyState text={selectedTimeline.length ? 'Only technical events so far.' : "Eli's progress will appear here."} />
                    ) : (
                      <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {selectedActivity.map((row, index) => (
                          <ActivityItem key={row.id} row={row} hasNext={index < selectedActivity.length - 1} />
                        ))}
                      </Box>
                    )}

                    <DebugEvents rows={selectedTimeline} />
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </Panel>

          <Panel title="Decisions" icon={<SecurityRounded fontSize="small" />}>
            <Stack spacing={1} sx={{ minHeight: 0 }}>
              <Stack spacing={0.7}>
                {permissions.length === 0 ? (
                  <EmptyState text="No decisions needed." />
                ) : (
                  permissions.map((permission) => (
                    <PermissionRow
                      key={permission.id}
                      permission={permission}
                      onAllow={() => handleResolvePermission(permission, 'approve-once')}
                      onAllowForRun={() => handleResolvePermission(permission, 'approve-run')}
                      onDeny={() => handleResolvePermission(permission, 'reject')}
                    />
                  ))
                )}
              </Stack>

              <Divider />

              <SectionLabel icon={<FolderRounded fontSize="small" />} text="Project context" />
              {selectedFolder ? (
                <Stack spacing={1}>
                  {projectFacts.map(([label, value]) => (
                    <Box key={label} sx={{ minWidth: 0 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800 }}>
                        {label}
                      </Typography>
                      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              ) : (
                <EmptyState text="Select a folder." />
              )}
            </Stack>
          </Panel>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function Panel({
  title,
  icon,
  children,
  grow = false,
  prominent = false,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  grow?: boolean;
  prominent?: boolean;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: prominent ? 1.2 : 1.1,
        height: grow ? { xs: 'auto', lg: '100%' } : undefined,
        minHeight: 0,
        borderColor: tokens.line,
        bgcolor: tokens.panel,
        boxShadow: prominent ? '0 10px 26px rgba(21, 26, 45, 0.05)' : 'none',
        overflow: 'hidden',
      }}
    >
      <Stack spacing={prominent ? 1.15 : 1} sx={{ height: '100%' }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', minHeight: 24 }}>
          <Box sx={{ color: tokens.muted, display: 'flex' }}>{icon}</Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800, color: tokens.ink, fontSize: 14 }}>
            {title}
          </Typography>
        </Stack>
        <Box sx={{ minHeight: 0, flex: 1, overflow: prominent ? { xs: 'visible', lg: 'hidden' } : 'auto', pr: prominent ? 0 : 0.2 }}>{children}</Box>
      </Stack>
    </Paper>
  );
}

function EliMark({
  active,
  tone,
  size = 42,
  contrast = 'light',
}: {
  active: boolean;
  tone: 'active' | 'waiting';
  size?: number;
  contrast?: 'blue' | 'light';
}) {
  const accent = tone === 'waiting' ? theme.palette.warning.main : tokens.ultramarine;
  const imageHeight = Math.max(18, size);
  const imageWidth = imageHeight * 1.63;
  const shouldBlink = size >= 28;
  const isRunning = active && tone === 'active';
  const isWaiting = active && tone === 'waiting';
  const markColor = contrast === 'blue' ? '#f8fbff' : tokens.ultramarine;
  const faceColor = '#6ff7ff';
  const screenColor = '#263cff';

  if (contrast === 'blue') {
    return (
      <Box
        sx={{
          width: imageWidth,
          height: imageHeight,
          position: 'relative',
          display: 'block',
          flexShrink: 0,
          overflow: 'hidden',
          borderRadius: 1,
          transformOrigin: '50% 72%',
          animation: isRunning ? 'eliBlueFloat 2.6s ease-in-out infinite' : isWaiting ? 'eliBlueAttention 1.8s ease-in-out infinite' : 'none',
          '@keyframes eliBlueFloat': {
            '0%, 100%': { transform: 'translate3d(0, 0, 0) rotate(-0.2deg)' },
            '50%': { transform: 'translate3d(0, -3%, 0) rotate(0.45deg)' },
          },
          '@keyframes eliBlueAttention': {
            '0%, 100%': { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
            '42%': { transform: 'translate3d(0, -2%, 0) rotate(-0.5deg)' },
            '64%': { transform: 'translate3d(0, 1%, 0) rotate(0.35deg)' },
          },
          '@keyframes eliBlueActiveFrame': {
            '0%, 54%, 100%': { opacity: 0 },
            '62%, 88%': { opacity: 1 },
          },
          '@media (prefers-reduced-motion: reduce)': {
            animation: 'none !important',
            '& *': {
              animation: 'none !important',
            },
          },
        }}
        aria-label="Eli"
      >
        <Box
          component="img"
          src={eliBlueIdleUrl}
          alt=""
          sx={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'cover',
          }}
        />
        {active && (
          <Box
            component="img"
            src={eliBlueActiveUrl}
            alt=""
            sx={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              display: 'block',
              objectFit: 'cover',
              opacity: isRunning ? 0 : 1,
              animation: isRunning ? 'eliBlueActiveFrame 2.6s ease-in-out infinite' : 'none',
            }}
          />
        )}
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: imageWidth,
        height: imageHeight,
        position: 'relative',
        display: 'block',
        flexShrink: 0,
        filter: active
          ? `drop-shadow(0 10px 14px ${alpha(accent, tone === 'waiting' ? 0.18 : 0.16)})`
          : `drop-shadow(0 8px 12px ${alpha(tokens.ultramarineDark, 0.14)})`,
        transformOrigin: '50% 72%',
        transition: 'filter 180ms ease-out, transform 180ms ease-out',
        animation: isRunning ? 'eliFloat 2.6s ease-in-out infinite' : isWaiting ? 'eliAttention 1.8s ease-in-out infinite' : 'none',
        '@keyframes eliFloat': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) rotate(-0.2deg)' },
          '50%': { transform: 'translate3d(0, -4%, 0) rotate(0.6deg)' },
        },
        '@keyframes eliAttention': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) rotate(0deg)' },
          '38%': { transform: 'translate3d(0, -3%, 0) rotate(-0.8deg)' },
          '62%': { transform: 'translate3d(0, 1%, 0) rotate(0.5deg)' },
        },
        '@keyframes eliFaceSwap': {
          '0%, 38%, 66%, 100%': { opacity: 0 },
          '44%, 58%': { opacity: 1 },
        },
        '@keyframes eliRayPulse': {
          '0%, 100%': { opacity: 0.35, transform: 'scale(0.92)' },
          '45%': { opacity: 1, transform: 'scale(1)' },
        },
        '@keyframes eliRayPop': {
          '0%, 72%, 100%': { opacity: 0, transform: 'scale(0.7)' },
          '80%, 92%': { opacity: 1, transform: 'scale(1)' },
        },
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none !important',
          '& *': {
            animation: 'none !important',
          },
        },
      }}
      aria-label="Eli"
    >
      <Box
        component="img"
        src={eliAgentUrl}
        alt=""
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'contain',
        }}
      />
      {shouldBlink && isRunning && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            opacity: 0,
            animation: 'eliFaceSwap 2.6s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              left: '34%',
              top: '42%',
              width: '14%',
              height: '19%',
              bgcolor: screenColor,
              borderRadius: 1,
              transform: 'rotate(45deg)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              left: '59%',
              top: '38%',
              width: '14%',
              height: '19%',
              bgcolor: screenColor,
              borderRadius: 1,
              transform: 'rotate(45deg)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              left: '38%',
              top: '47%',
              width: '11%',
              height: '12%',
              borderTop: `4px solid ${faceColor}`,
              borderRadius: '999px 999px 0 0',
              transform: 'rotate(-3deg)',
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              left: '62%',
              top: '46%',
              width: '10%',
              height: '15%',
              '&::before, &::after': {
                content: '""',
                position: 'absolute',
                left: 0,
                top: '45%',
                width: '100%',
                height: 4,
                borderRadius: 999,
                bgcolor: faceColor,
                transformOrigin: '12% 50%',
              },
              '&::before': { transform: 'rotate(-38deg)' },
              '&::after': { transform: 'rotate(38deg)' },
            }}
          />
        </Box>
      )}
      {active && size >= 28 && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: '78%',
            top: '-9%',
            width: '24%',
            height: '26%',
            pointerEvents: 'none',
            transformOrigin: '15% 85%',
            animation: isRunning ? 'eliRayPulse 1.35s ease-in-out infinite' : 'eliRayPop 1.8s ease-out infinite',
          }}
        >
          {[0, 1, 2].map((index) => (
            <Box
              key={index}
              sx={{
                position: 'absolute',
                left: `${index * 22}%`,
                top: index === 0 ? '14%' : index === 1 ? '32%' : '54%',
                width: '34%',
                height: 4,
                borderRadius: 999,
                bgcolor: isWaiting ? theme.palette.warning.main : markColor,
                transform: index === 0 ? 'rotate(-82deg)' : index === 1 ? 'rotate(-46deg)' : 'rotate(2deg)',
                opacity: index === 2 ? 0.82 : 1,
              }}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}

function FolderRow({
  folder,
  selected,
  onSelect,
  onRescan,
}: {
  folder: FolderRecord;
  selected: boolean;
  onSelect: () => void;
  onRescan: () => void;
}) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      sx={{
        width: '100%',
        cursor: 'pointer',
        textAlign: 'left',
        border: '1px solid',
        borderColor: selected ? alpha(theme.palette.primary.main, 0.36) : tokens.line,
        bgcolor: selected ? tokens.ultramarineWash : tokens.panelSolid,
        borderRadius: 1,
        p: 0.8,
        outline: 'none',
        '&:focus-visible': {
          boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.18)}`,
        },
      }}
    >
      <Stack spacing={0.5}>
        <Stack direction="row" spacing={0.8} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 800, flex: 1, minWidth: 0 }} noWrap>
            {folder.name}
          </Typography>
          <Tooltip title="Rescan">
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                onRescan();
              }}
            >
              <RefreshRounded fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word', lineHeight: 1.25 }}>
          {folder.path}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
          {folder.git.branch && <Chip size="small" label={folder.git.branch} variant="outlined" />}
          {folder.git.dirty && <Chip size="small" label="dirty" color="warning" variant="outlined" />}
          {folder.packageManager && <Chip size="small" label={folder.packageManager} variant="outlined" />}
        </Box>
      </Stack>
    </Box>
  );
}

function TaskRow({ task, active }: { task: AgentTask; active: boolean }) {
  return (
    <Box
      sx={{
        border: '1px solid',
        borderColor: active ? alpha(theme.palette.primary.main, 0.32) : tokens.line,
        borderRadius: 1,
        p: 0.75,
        bgcolor: active ? tokens.ultramarineWash : tokens.panelSolid,
      }}
    >
      <Stack spacing={0.45}>
        <Stack direction="row" spacing={0.6} sx={{ alignItems: 'center' }}>
          <Chip size="small" label={task.mode} color={task.mode === 'run' ? 'primary' : 'default'} />
          <StatusChip status={task.status} />
          <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', flexShrink: 0 }}>
            {new Date(task.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Stack>
        <Typography variant="body2" sx={{ fontWeight: 760 }} noWrap>
          {task.prompt}
        </Typography>
      </Stack>
    </Box>
  );
}

function AssetRow({ asset }: { asset: GitHubCopilotAsset }) {
  return (
    <Box
      sx={{
        border: `1px solid ${tokens.line}`,
        bgcolor: tokens.panelSolid,
        borderRadius: 1,
        p: 0.85,
      }}
    >
      <Stack spacing={0.45}>
        <Stack direction="row" spacing={0.8} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Chip size="small" label={asset.kind} color={asset.kind === 'agent' ? 'primary' : 'default'} sx={{ height: 22 }} />
          <Typography variant="body2" sx={{ fontWeight: 800, minWidth: 0, flex: 1 }} noWrap>
            {asset.title}
          </Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
          {asset.path}
        </Typography>
        {asset.description && (
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
            {asset.description}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}

function PermissionRow({
  permission,
  onAllow,
  onAllowForRun,
  onDeny,
}: {
  permission: PendingPermission;
  onAllow: () => void;
  onAllowForRun: () => void;
  onDeny: () => void;
}) {
  const actionLabel = permissionActionLabel(permission.kind);

  return (
    <Box
      sx={{
        border: `1px solid ${alpha(theme.palette.warning.main, 0.22)}`,
        bgcolor: tokens.panelSolid,
        borderRadius: 1,
        p: 0.8,
      }}
    >
      <Stack spacing={0.65}>
        <Stack direction="row" spacing={0.7} sx={{ alignItems: 'flex-start' }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              bgcolor: alpha(theme.palette.warning.main, 0.1),
              color: theme.palette.warning.main,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <SecurityRounded sx={{ fontSize: 16 }} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 780, color: tokens.ink }} noWrap>
              {actionLabel}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Needs decision
            </Typography>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {new Date(permission.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Typography>
        </Stack>
        {permission.toolCallId && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              bgcolor: alpha(theme.palette.warning.main, 0.07),
              borderRadius: 0.8,
              px: 0.7,
              py: 0.35,
            }}
          >
            {permission.toolCallId}
          </Typography>
        )}
        <Stack direction="row" spacing={0.55} sx={{ flexWrap: 'wrap' }}>
          <Button size="small" variant="contained" startIcon={<CheckCircleRounded />} onClick={onAllow} sx={{ flex: '1 1 104px' }}>
            Allow once
          </Button>
          <Button size="small" variant="outlined" color="warning" startIcon={<CheckCircleRounded />} onClick={onAllowForRun} sx={{ flex: '1 1 104px' }}>
            Allow run
          </Button>
          <Button size="small" variant="text" color="inherit" startIcon={<CloseRounded />} onClick={onDeny} sx={{ px: 0.8 }}>
            Deny
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}

function permissionActionLabel(kind: string): string {
  if (kind === 'read') {
    return 'Read files in the workspace';
  }

  if (kind === 'edit' || kind === 'write') {
    return 'Change files in the workspace';
  }

  if (kind === 'shell' || kind === 'command') {
    return 'Run a local command';
  }

  return 'Continue with a protected action';
}

function ActivityItem({ row, hasNext }: { row: TimelineRow; hasNext: boolean }) {
  const tone = timelineToneStyles(row.presentation.tone);
  const isAssistant = row.presentation.kind === 'assistant';

  return (
    <Box
      component="li"
      sx={{
        display: 'grid',
        gridTemplateColumns: '24px minmax(0, 1fr)',
        gap: 0.8,
        pb: hasNext ? 0.75 : 0,
        contentVisibility: 'auto',
        containIntrinsicSize: '0 76px',
      }}
    >
      <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
        {hasNext && (
          <Box
            sx={{
              position: 'absolute',
              top: 24,
              bottom: -7,
              width: 1,
              bgcolor: tokens.line,
            }}
          />
        )}
        <Box
          sx={{
            width: isAssistant ? 24 : 20,
            height: isAssistant ? 22 : 20,
            borderRadius: isAssistant ? 0 : '50%',
            border: isAssistant ? 'none' : '1px solid',
            borderColor: tone.border,
            bgcolor: isAssistant ? 'transparent' : tone.iconBg,
            color: tone.color,
            display: 'grid',
            placeItems: 'center',
            overflow: 'visible',
            zIndex: 1,
          }}
        >
          {timelineIcon(row.presentation.kind)}
        </Box>
      </Box>

      <Box
        sx={{
          minWidth: 0,
          border: '1px solid',
          borderColor: tone.border,
          borderRadius: 1,
          bgcolor: tone.bg,
          px: 0.8,
          py: 0.65,
        }}
      >
        <Stack spacing={0.45}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 780, color: tone.color, minWidth: 0, flex: 1 }} noWrap>
              {row.presentation.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              {new Date(row.createdAt).toLocaleTimeString()}
            </Typography>
          </Stack>

          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'text.primary', lineHeight: 1.35 }}>
            {row.presentation.body}
          </Typography>
        </Stack>
      </Box>
    </Box>
  );
}

function DebugEvents({ rows }: { rows: TimelineRow[] }) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <Box
      component="details"
      sx={{
        mt: 1,
        border: `1px solid ${tokens.line}`,
        borderRadius: 1,
        bgcolor: tokens.panelSolid,
        '&[open]': {
          pb: 1,
        },
      }}
    >
      <Box
        component="summary"
        sx={{
          cursor: 'pointer',
          px: 1,
          py: 0.9,
          color: 'text.secondary',
          fontSize: 12,
          fontWeight: 780,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        Debug events ({rows.length} SDK events)
      </Box>
      <Stack spacing={0.8} sx={{ px: 1 }}>
        {rows.map((row) => (
          <DebugTimelineItem key={row.id} row={row} />
        ))}
      </Stack>
    </Box>
  );
}

function DebugTimelineItem({ row }: { row: TimelineRow }) {
  return (
    <Box
      sx={{
        border: `1px solid ${tokens.line}`,
        borderRadius: 1,
        bgcolor: tokens.panelSolid,
        p: 0.9,
        contentVisibility: 'auto',
        containIntrinsicSize: '0 72px',
      }}
    >
      <Stack spacing={0.6}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Typography variant="caption" sx={{ fontWeight: 780, color: 'text.primary', flex: 1, minWidth: 0 }} noWrap>
            {row.type}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
            {new Date(row.createdAt).toLocaleTimeString()}
          </Typography>
        </Stack>
        <Typography
          component="pre"
          variant="caption"
          sx={{
            m: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'text.secondary',
            fontFamily: 'inherit',
          }}
        >
          {row.presentation.body}
        </Typography>
      </Stack>
    </Box>
  );
}

function timelineIcon(kind: TimelineKind): ReactNode {
  const iconSx = { fontSize: 15 };

  if (kind === 'assistant') {
    return <EliMark active={false} tone="active" size={18} />;
  }

  if (kind === 'reasoning') {
    return <PsychologyRounded sx={iconSx} />;
  }

  if (kind === 'tool' || kind === 'command') {
    return <TerminalRounded sx={iconSx} />;
  }

  if (kind === 'permission') {
    return <SecurityRounded sx={iconSx} />;
  }

  if (kind === 'error') {
    return <ErrorOutlineRounded sx={iconSx} />;
  }

  if (kind === 'status') {
    return <CheckCircleRounded sx={iconSx} />;
  }

  return <HistoryRounded sx={iconSx} />;
}

function timelineToneStyles(tone: TimelineTone) {
  if (tone === 'info') {
    return {
      bg: alpha(theme.palette.info.main, 0.045),
      border: alpha(theme.palette.info.main, 0.18),
      color: theme.palette.info.dark,
      iconBg: alpha(theme.palette.info.main, 0.1),
    };
  }

  if (tone === 'success') {
    return {
      bg: alpha(theme.palette.success.main, 0.045),
      border: alpha(theme.palette.success.main, 0.18),
      color: theme.palette.success.dark,
      iconBg: alpha(theme.palette.success.main, 0.1),
    };
  }

  if (tone === 'warning') {
    return {
      bg: alpha(theme.palette.warning.main, 0.055),
      border: alpha(theme.palette.warning.main, 0.2),
      color: theme.palette.warning.dark,
      iconBg: alpha(theme.palette.warning.main, 0.1),
    };
  }

  if (tone === 'error') {
    return {
      bg: alpha(theme.palette.error.main, 0.055),
      border: alpha(theme.palette.error.main, 0.22),
      color: theme.palette.error.dark,
      iconBg: alpha(theme.palette.error.main, 0.1),
    };
  }

  return {
    bg: tokens.panelSolid,
    border: tokens.line,
    color: theme.palette.text.primary,
    iconBg: tokens.ultramarineWash,
  };
}

function SectionLabel({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <Stack direction="row" spacing={0.6} sx={{ color: 'text.secondary', alignItems: 'center' }}>
      {icon}
      <Typography variant="caption" sx={{ fontWeight: 780, textTransform: 'uppercase', letterSpacing: 0.24 }}>
        {text}
      </Typography>
    </Stack>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <Box sx={{ border: `1px dashed ${tokens.lineStrong}`, borderRadius: 1, p: 0.9, color: 'text.secondary', bgcolor: tokens.panelSolid }}>
      <Typography variant="body2">{text}</Typography>
    </Box>
  );
}

function StatusChip({ status }: { status: AgentTask['status'] }) {
  const color = status === 'idle' ? 'success' : status === 'failed' || status === 'aborted' ? 'error' : status === 'running' ? 'primary' : 'default';

  return <Chip size="small" label={status} color={color} variant={status === 'running' ? 'filled' : 'outlined'} />;
}

function TaskStateChip({ task, inverted = false }: { task: AgentTask; inverted?: boolean }) {
  const invertedSx = inverted
    ? {
        bgcolor: alpha('#ffffff', 0.16),
        color: '#fff',
        borderColor: alpha('#ffffff', 0.34),
        fontWeight: 760,
      }
    : { fontWeight: 760 };

  if (task.waitReason === 'approval') {
    return <Chip size="small" label="Needs decision" color={inverted ? 'default' : 'warning'} variant={inverted ? 'outlined' : 'filled'} sx={invertedSx} />;
  }

  if (task.phase === 'running') {
    return <Chip size="small" label="Eli working" color={inverted ? 'default' : 'primary'} variant={inverted ? 'outlined' : 'filled'} sx={invertedSx} />;
  }

  if (task.phase === 'waiting') {
    return <Chip size="small" label="Ready" variant="outlined" sx={invertedSx} />;
  }

  if (task.phase === 'terminal') {
    return <Chip size="small" label={task.outcome ?? 'Done'} color={inverted ? 'default' : task.outcome === 'failed' ? 'error' : 'success'} variant="outlined" sx={invertedSx} />;
  }

  return <Chip size="small" label="Queued" variant="outlined" sx={invertedSx} />;
}

function taskStatusText(task: AgentTask): string {
  if (task.phase === 'waiting' && task.waitReason === 'approval') {
    return 'Eli is waiting on you';
  }

  if (task.phase === 'waiting' && task.waitReason === 'operator') {
    return 'Ready for next instruction';
  }

  if (task.phase === 'terminal') {
    return task.outcome ? `Task ${task.outcome}` : 'Task ended';
  }

  return `Task ${task.phase}`;
}
