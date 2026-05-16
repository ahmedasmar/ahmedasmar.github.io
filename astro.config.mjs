// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://ahmedasmar.github.io',
	integrations: [
		starlight({
			title: 'Ahmad Asmar',
			description: 'Staff DevOps / Platform Lead — AWS, EKS, GitOps, OSS maintainer (3,767 Terraform Registry downloads · 158★ Claude Code skills marketplace).',
			logo: {
				src: './src/assets/avatar.svg',
				replacesTitle: false,
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/ahmedasmar' },
				{ icon: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/ahmadasmar' },
			],
			editLink: {
				baseUrl: 'https://github.com/ahmedasmar/ahmedasmar.github.io/edit/main/',
			},
			lastUpdated: true,
			pagination: false,
			tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
			customCss: ['./src/styles/custom.css'],
			head: [
				{
					tag: 'meta',
					attrs: { property: 'og:image', content: 'https://ahmedasmar.github.io/og-image.png' },
				},
				{
					tag: 'meta',
					attrs: { name: 'twitter:card', content: 'summary_large_image' },
				},
			],
			sidebar: [
				{ label: 'Home', slug: '' },
				{
					label: 'Projects',
					items: [
						{ label: 'Terraform GitLab Runner module', slug: 'projects/terraform-runner-module' },
						{ label: 'DevOps Claude Skills', slug: 'projects/devops-claude-skills' },
						{ label: 'Cross-Account TargetGroupBinding', slug: 'projects/cross-account-tgb' },
						{ label: 'GitOps engine (ArgoCD)', slug: 'projects/gitops-engine' },
					],
				},
				{
					label: 'Architecture',
					items: [
						{ label: 'Scale-to-zero runners', slug: 'architecture/scale-to-zero-runners' },
						{ label: 'Cross-account TargetGroupBinding', slug: 'architecture/cross-account-tgb' },
						{ label: 'Terraform → ArgoCD migration', slug: 'architecture/gitops-engine' },
					],
				},
				{ label: 'Stack', slug: 'stack' },
				{ label: 'About', slug: 'about' },
			],
		}),
	],
});
