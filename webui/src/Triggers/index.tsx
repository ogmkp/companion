import React, { useCallback, useContext, useEffect, useState, useMemo, useRef } from 'react'
import {
	CButton,
	CButtonGroup,
	CCol,
	CFormSwitch,
	CNav,
	CNavItem,
	CNavLink,
	CRow,
	CTabContent,
	CTabPane,
} from '@coreui/react'
import { MyErrorBoundary, SocketContext, socketEmitPromise } from '../util.js'
import dayjs from 'dayjs'
import sanitizeHtml from 'sanitize-html'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
	faAdd,
	faCalculator,
	faClone,
	faDownload,
	faFileExport,
	faSort,
	faTrash,
} from '@fortawesome/free-solid-svg-icons'
import { useDrag, useDrop } from 'react-dnd'
import { nanoid } from 'nanoid'
import { EditTriggerPanel } from './EditPanel.js'
import { GenericConfirmModal, GenericConfirmModalRef } from '../Components/GenericConfirmModal.js'
import { ParseControlId } from '@companion-app/shared/ControlId.js'
import { ConfirmExportModal, ConfirmExportModalRef } from '../Components/ConfirmExportModal.js'
import classNames from 'classnames'
import { ClientTriggerData } from '@companion-app/shared/Model/TriggerModel.js'
import { observer } from 'mobx-react-lite'
import { RootAppStoreContext } from '../Stores/RootAppStore.js'

export const Triggers = observer(function Triggers() {
	const { socket, triggersList } = useContext(RootAppStoreContext)

	const [editItemId, setEditItemId] = useState<string | null>(null)
	const [tabResetToken, setTabResetToken] = useState(nanoid())
	const [activeTab, setActiveTab] = useState<'placeholder' | 'edit'>('placeholder')

	// Ensure the selected trigger is valid
	useEffect(() => {
		setEditItemId((currentId) => {
			if (currentId && triggersList.triggers.get(currentId)) {
				return currentId
			} else {
				return null
			}
		})
	}, [triggersList])

	const doChangeTab = useCallback((newTab: 'placeholder' | 'edit') => {
		setActiveTab((oldTab) => {
			// const preserveButtonsTab =  newTab === 'variables' && oldTab === 'edit'
			if (newTab !== 'edit' && oldTab !== newTab /*&& !preserveButtonsTab*/) {
				setEditItemId(null)
				setTabResetToken(nanoid())
			}
			return newTab
		})
	}, [])
	const doEditItem = useCallback((controlId: string) => {
		setEditItemId(controlId)
		setActiveTab('edit')
	}, [])

	const doAddNew = useCallback(() => {
		socketEmitPromise(socket, 'triggers:create', [])
			.then((controlId) => {
				console.log('created trigger', controlId)
				doEditItem(controlId)
			})
			.catch((e) => {
				console.error('failed to create trigger', e)
			})
	}, [socket, doEditItem])

	const exportModalRef = useRef<ConfirmExportModalRef>(null)
	const showExportModal = useCallback(() => {
		exportModalRef.current?.show(`/int/export/triggers/all`)
	}, [])

	return (
		<CRow className="triggers-page split-panels">
			<ConfirmExportModal ref={exportModalRef} title="Export Triggers" />

			<CCol xs={12} xl={6} className="primary-panel">
				<h4>Triggers and schedules</h4>
				<p>This allows you to run actions based on Companion, feedback or time events.</p>

				<CButtonGroup style={{ marginBottom: '0.3em' }}>
					<CButton color="primary" onClick={doAddNew}>
						<FontAwesomeIcon icon={faAdd} /> Add Trigger
					</CButton>
				</CButtonGroup>

				<TriggersTable editItem={doEditItem} selectedControlId={editItemId} />

				<CButton
					color="light"
					style={{
						marginTop: 10,
					}}
					onClick={showExportModal}
				>
					<FontAwesomeIcon icon={faFileExport} /> Export all
				</CButton>
			</CCol>

			<CCol xs={12} xl={6} className="secondary-panel">
				<div className="secondary-panel-inner">
					<CNav variant="tabs" role="tablist">
						{!editItemId && (
							<CNavItem>
								<CNavLink active={activeTab === 'placeholder'} onClick={() => doChangeTab('placeholder')}>
									Select a trigger
								</CNavLink>
							</CNavItem>
						)}
						<CNavItem
							className={classNames({
								hidden: !editItemId,
							})}
						>
							<CNavLink active={activeTab === 'edit'} onClick={() => doChangeTab('edit')}>
								<FontAwesomeIcon icon={faCalculator} /> Edit Trigger
							</CNavLink>
						</CNavItem>
					</CNav>
					<CTabContent>
						{!editItemId && (
							<CTabPane data-tab="placeholder" visible={activeTab === 'placeholder'}>
								<p>Select a trigger...</p>
							</CTabPane>
						)}
						<CTabPane data-tab="edit" visible={activeTab === 'edit'}>
							<MyErrorBoundary>
								{editItemId ? <EditTriggerPanel key={`${editItemId}.${tabResetToken}`} controlId={editItemId} /> : ''}
							</MyErrorBoundary>
						</CTabPane>
					</CTabContent>
				</div>
			</CCol>
		</CRow>
	)
})

interface TriggersTableProps {
	editItem: (controlId: string) => void
	selectedControlId: string | null
}

const tableDateFormat = 'MM/DD HH:mm:ss'
const TriggersTable = observer(function TriggersTable({ editItem, selectedControlId }: TriggersTableProps) {
	const { socket, triggersList } = useContext(RootAppStoreContext)

	const moveTrigger = useCallback(
		(itemId: string, targetId: string) => {
			itemId = itemId + ''
			targetId = targetId + ''

			const rawIds = Array.from(triggersList.triggers.entries())
				.sort(([, a], [, b]) => a.sortOrder - b.sortOrder)
				.map(([id]) => id)

			const itemIndex = rawIds.indexOf(itemId)
			const targetIndex = rawIds.indexOf(targetId)
			if (itemIndex === -1 || targetIndex === -1) return

			const newIds = rawIds.filter((id) => id !== itemId)
			newIds.splice(targetIndex, 0, itemId)

			socketEmitPromise(socket, 'triggers:set-order', [newIds]).catch((e) => {
				console.error('Reorder failed', e)
			})
		},
		[socket, triggersList]
	)

	return (
		<table className="table-tight table-responsive-sm ">
			<thead>
				<tr>
					<th>&nbsp;</th>
					<th>Name</th>
					<th>Trigger</th>
					<th>&nbsp;</th>
				</tr>
			</thead>
			<tbody>
				{triggersList.triggers.size > 0 ? (
					Array.from(triggersList.triggers.entries())
						.sort((a, b) => a[1].sortOrder - b[1].sortOrder)
						.map(([controlId, item]) => (
							<TriggersTableRow
								key={controlId}
								controlId={controlId}
								item={item}
								editItem={editItem}
								moveTrigger={moveTrigger}
								isSelected={controlId === selectedControlId}
							/>
						))
				) : (
					<tr>
						<td colSpan={4} className="currentlyNone">
							There currently are no triggers or scheduled tasks.
						</td>
					</tr>
				)}
			</tbody>
		</table>
	)
})

interface TriggersTableRowDragData {
	id: string
}
interface TriggersTableRowDragStatus {
	isDragging: boolean
}

interface TriggersTableRowProps {
	controlId: string
	item: ClientTriggerData
	editItem: (controlId: string) => void
	moveTrigger: (hoverControlId: string, controlId: string) => void
	isSelected: boolean
}

function TriggersTableRow({ controlId, item, editItem, moveTrigger, isSelected }: TriggersTableRowProps) {
	const socket = useContext(SocketContext)

	const confirmRef = useRef<GenericConfirmModalRef>(null)

	const doEnableDisable = useCallback(() => {
		socketEmitPromise(socket, 'controls:set-options-field', [controlId, 'enabled', !item.enabled]).catch((e) => {
			console.error('failed to toggle trigger state', e)
		})
	}, [socket, controlId, item.enabled])
	const doDelete = useCallback(() => {
		confirmRef.current?.show('Delete trigger', 'Are you sure you wish to delete this trigger?', 'Delete', () => {
			socketEmitPromise(socket, 'triggers:delete', [controlId]).catch((e) => {
				console.error('Failed to delete', e)
			})
		})
	}, [socket, controlId])
	const doEdit = useCallback(() => editItem(controlId), [editItem, controlId])
	const doClone = useCallback(() => {
		socketEmitPromise(socket, 'triggers:clone', [controlId])
			.then((newControlId) => {
				console.log('cloned to control', newControlId)
			})
			.catch((e) => {
				console.error('Failed to clone', e)
			})
	}, [socket, controlId])

	const descriptionHtml = useMemo(
		() => ({
			__html: sanitizeHtml(item.description, {
				allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
				disallowedTagsMode: 'escape',
			}),
		}),
		[item.description]
	)

	const ref = useRef(null)
	const [, drop] = useDrop<TriggersTableRowDragData>({
		accept: 'trigger',
		hover(hoverItem, _monitor) {
			if (!ref.current) {
				return
			}
			// Don't replace items with themselves
			if (hoverItem.id === controlId) {
				return
			}

			// Time to actually perform the action
			moveTrigger(hoverItem.id, controlId)
		},
	})
	const [{ isDragging }, drag, preview] = useDrag<TriggersTableRowDragData, unknown, TriggersTableRowDragStatus>({
		type: 'trigger',
		item: {
			id: controlId,
		},
		collect: (monitor) => ({
			isDragging: monitor.isDragging(),
		}),
	})
	preview(drop(ref))

	const parsedId = ParseControlId(controlId)
	const exportId = parsedId?.type === 'trigger' ? parsedId?.trigger : undefined

	return (
		<tr
			ref={ref}
			className={classNames({
				'connectionlist-dragging': isDragging,
				'connectionlist-notdragging': !isDragging,
				'connectionlist-selected': isSelected,
			})}
		>
			<td ref={drag} className="td-reorder">
				<FontAwesomeIcon icon={faSort} />
			</td>
			<td onClick={doEdit} className="hand">
				<b>{item.name}</b>

				{/* TODO: For some reason, the modal component leaves a big inline
				footprint within tables when not active. This is probably the best 
				place to hide it while it does that.. (until someone figures it out) */}
				<br />
				<GenericConfirmModal ref={confirmRef} />
				{/* end hax */}
			</td>
			<td onClick={doEdit} className="hand">
				<span dangerouslySetInnerHTML={descriptionHtml} />
				<br />
				{item.lastExecuted ? <small>Last run: {dayjs(item.lastExecuted).format(tableDateFormat)}</small> : ''}
			</td>
			<td className="action-buttons">
				<CButtonGroup>
					<CButton color="white" onClick={doClone} title="Clone">
						<FontAwesomeIcon icon={faClone} />
					</CButton>
					<CButton color="gray" onClick={doDelete} title="Delete">
						<FontAwesomeIcon icon={faTrash} />
					</CButton>
					<CButton
						color="white"
						href={`/int/export/triggers/single/${exportId}`}
						target="_new"
						disabled={!exportId}
						title="Export"
					>
						<FontAwesomeIcon icon={faDownload} />
					</CButton>

					<CFormSwitch
						color="success"
						checked={item.enabled}
						onChange={doEnableDisable}
						title={item.enabled ? 'Disable trigger' : 'Enable trigger'}
					/>
				</CButtonGroup>
			</td>
		</tr>
	)
}
