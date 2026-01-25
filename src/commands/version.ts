import ora from 'ora';
import chalk from 'chalk';
import semver from 'semver';
import { supabase } from '../index.js';

interface CreateVersionOptions {
  notes?: string;
  changelog?: string;
  mandatory?: boolean;
}

export async function createVersion(version: string, options: CreateVersionOptions) {
  if (!semver.valid(version)) {
    console.error(chalk.red(`❌ Invalid semantic version: ${version}`));
    console.error(chalk.gray('   Expected format: MAJOR.MINOR.PATCH (e.g., 1.0.0, 2.1.3-beta.1)'));
    process.exit(1);
  }

  const spinner = ora(`Creating version ${version}...`).start();

  try {
    const { data, error } = await supabase
      .from('app_versions')
      .insert({
        version_name: version,
        release_notes: options.notes,
        changelog: options.changelog,
        is_mandatory: options.mandatory || false,
        is_published: false
      })
      .select()
      .single();

    if (error) throw error;

    spinner.succeed(chalk.green(`✓ Version ${version} created`));
    console.log(chalk.gray(`  ID: ${data.id}`));
    console.log(chalk.gray(`  Status: Unpublished`));
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to create version: ${error.message}`));
    process.exit(1);
  }
}

interface ListVersionsOptions {
  published?: boolean;
  limit?: string;
  offset?: string;
}

export async function listVersions(options: ListVersionsOptions) {
  const spinner = ora('Fetching versions...').start();

  try {
    const limit = options.limit ? parseInt(options.limit) : 20;
    const offset = options.offset ? parseInt(options.offset) : 0;

    let query = supabase
      .from('app_versions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (options.published) {
      query = query.eq('is_published', true);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    spinner.stop();

    if (!data || data.length === 0) {
      console.log(chalk.yellow('No versions found'));
      return;
    }

    console.log(chalk.bold('\nVersions:'));
    console.log(chalk.gray(`Showing ${offset + 1}-${offset + data.length} of ${count || 0} total\n`));
    
    data.forEach((v: any) => {
      const status = v.is_published ? chalk.green('Published') : chalk.yellow('Draft');
      const mandatory = v.is_mandatory ? chalk.red(' [MANDATORY]') : '';
      console.log(`  ${chalk.bold(v.version_name)} - ${status}${mandatory}`);
      console.log(chalk.gray(`    Created: ${new Date(v.created_at).toLocaleDateString()}`));
      if (v.release_notes) {
        console.log(chalk.gray(`    Notes: ${v.release_notes.substring(0, 60)}...`));
      }
    });

    // Show pagination hints
    if (count && count > offset + data.length) {
      console.log(chalk.gray(`\n  Use --limit and --offset for pagination`));
      console.log(chalk.gray(`  Next page: --offset ${offset + limit}`));
    }
  } catch (error: any) {
    spinner.fail(chalk.red(`Failed to list versions: ${error.message}`));
    process.exit(1);
  }
}
