<script lang="ts">
import { useNodesInitialized, useSvelteFlow } from '@xyflow/svelte'

/**
 * Renders nothing; exists because `fitView` on init runs before the nodes
 * are measured and, worse, sometimes before the canvas has a size at all —
 * a hidden-then-shown pane fits a 0×0 box and clamps to minZoom. The
 * parent passes the wrapper's live client size in; we fit once nodes AND
 * a real surface exist, and re-fit whenever that surface changes size.
 */
const { w, h, revision = '' }: { w: number; h: number; revision?: string } = $props()

const initialized = useNodesInitialized()
const { fitView } = useSvelteFlow()

let fittedFor = $state('')
$effect(() => {
	const key = `${w}x${h}:${revision}`
	if (initialized.current && w > 50 && h > 50 && fittedFor !== key) {
		fittedFor = key
		void fitView({ padding: 0.1 })
	}
})
</script>
