import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// because this was hard to find, I will leave it here
// https://github.com/dcastil/tailwind-merge/blob/v2.2.1/src/lib/default-config.ts
const customTwMerge = extendTailwindMerge({
	extend: {
		theme: {
			spacing: [
				'box-xs',
				'box-md',
				'box-lg',
				'box-xl',
				'grid-2xs',
				'grid-xs',
				'grid-md',
				'grid-lg'
			]
		},
		// classGroups: {
		//     w: [
		//         {
		//             w: ['icon-xs', 'icon-sm', 'icon', 'icon-m', 'avatar', 'avatar-xxl'],
		//         },
		//     ],
		//     'min-w': [
		//         {
		//             'min-w': ['icon-xs', 'icon-sm', 'icon', 'icon-m'],
		//         },
		//     ],
		//     'max-w': [
		//         {
		//             'max-w': ['content', 'profile-avatar'],
		//         },
		//     ],
		//     h: [
		//         {
		//             h: [
		//                 'icon-xs',
		//                 'icon-sm',
		//                 'icon',
		//                 'icon-m',
		//                 'profile-avatar',
		//                 'avatar-xxl',
		//                 'avatar',
		//                 'brand',
		//             ],
		//         },
		//     ],
		//     'min-h': [
		//         {
		//             'min-h': ['icon-xs', 'icon-sm', 'icon', 'icon-m'],
		//         },
		//     ],
		//     z: [
		//         {
		//             z: ['loader'],
		//         },
		//     ],
		//     'font-size': [
		//         {
		//             text: [
		//                 'h1',
		//                 'h2',
		//                 'h3',
		//                 'h4',
		//                 'h5',
		//                 'h1-tablet',
		//                 'h2-tablet',
		//                 'h3-tablet',
		//                 'h4-tablet',
		//                 'h5-tablet',
		//                 'copy-xs',
		//                 'copy',
		//                 'copy-tablet',
		//                 'label',
		//                 'sm',
		//             ],
		//         },
		//     ],
		//     leading: [
		//         {
		//             leading: ['default', 'md', 'lg'],
		//         },
		//     ],
		// },
		conflictingClassGroups: {}
	}
});

// @todo fix components class="cn()" issue. The correct return here is :ClassValue
export function cn(...inputs: ClassValue[]): any {
	return customTwMerge(clsx(inputs));
}
